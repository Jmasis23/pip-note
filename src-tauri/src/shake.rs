//! Native cursor input for Landmarks (Windows). Separated stages:
//!   1. collect  - low-level mouse hook (mouse only) turns OS events into `Sample`s
//!   2. recognize + match - `pip_core::landmarks::Engine`
//!   3. dispatch - `crate::open_tool`; the hook never touches UI
//!   4. lifecycle - startup failure is reported in `Status`, `stop()` unhooks
//! With no enabled Landmark the old "shake anywhere opens Capture" detector stays active. Elsewhere this is a no-op.
use pip_core::landmarks::Engine;
use std::sync::{atomic::{AtomicBool, AtomicU8}, Arc, Mutex};
use tauri::AppHandle;

/// "starting" | "running" | "failed: <reason>" | "stopped" | "unsupported"
pub type Status = Arc<Mutex<String>>;
/// Candidate progress for the on-screen meter. The hook only writes; a ticker elsewhere reads.
#[derive(Clone, Copy, Default)]
pub struct Meter { pub frac: f64, pub x: f64, pub y: f64 }
pub static METER: Mutex<Meter> = Mutex::new(Meter { frac: 0.0, x: 0.0, y: 0.0 });

#[cfg(not(windows))]
pub fn start(_app: AppHandle, _enabled: Arc<AtomicBool>, _level: Arc<AtomicU8>, _engine: Arc<Mutex<Engine>>, status: Status) { *status.lock().unwrap() = "unsupported".into(); }
#[cfg(not(windows))]
pub fn stop() {}

#[cfg(windows)]
static THREAD_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

#[cfg(windows)]
pub fn stop() {
    use std::sync::atomic::Ordering;
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
    let id = THREAD_ID.swap(0, Ordering::SeqCst);
    if id != 0 { unsafe { let _ = PostThreadMessageW(id, WM_QUIT, WPARAM(0), LPARAM(0)); } }
}

#[cfg(windows)]
pub fn start(app: AppHandle, enabled: Arc<AtomicBool>, level: Arc<AtomicU8>, engine: Arc<Mutex<Engine>>, status: Status) {
    use pip_core::gesture::{ShakeDetector, ShakeOpts};
    use pip_core::landmarks::{GestureOpts, Sample};
    use std::sync::atomic::Ordering;
    use std::sync::OnceLock;
    use std::time::Instant;
    use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::WindowsAndMessaging::*;

    struct Ctx { app: AppHandle, enabled: Arc<AtomicBool>, level: Arc<AtomicU8>, applied: u8, engine: Arc<Mutex<Engine>>, legacy: ShakeDetector, t0: Instant, buttons: i32, last_button: Instant }
    static CTX: OnceLock<Mutex<Ctx>> = OnceLock::new();
    const INJECTED: u32 = 0x3; // LLMHF_INJECTED | LLMHF_LOWER_IL_INJECTED

    unsafe extern "system" fn hook(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code >= 0 {
            if let Some(m) = CTX.get() {
                // Never block the system input queue: skip the sample if the lock is busy.
                if let Ok(mut c) = m.try_lock() {
                    match w.0 as u32 {
                        WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN => { c.buttons += 1; c.last_button = Instant::now(); }
                        WM_LBUTTONUP | WM_RBUTTONUP | WM_MBUTTONUP => { c.buttons = (c.buttons - 1).max(0); c.last_button = Instant::now(); }
                        WM_MOUSEMOVE => {
                            if c.buttons > 0 && c.last_button.elapsed().as_secs() > 8 { c.buttons = 0; }
                            let want = c.level.load(Ordering::Relaxed);
                            let paused = !c.enabled.load(Ordering::Relaxed);
                            let ms = &*(l.0 as *const MSLLHOOKSTRUCT);
                            let t = c.t0.elapsed().as_secs_f64() * 1000.0;
                            let down = c.buttons > 0;
                            let sample = Sample { x: ms.pt.x as f64, y: ms.pt.y as f64, t_ms: t, button_down: down, injected: ms.flags & INJECTED != 0 };
                            let (act, any_landmark, prog) = match c.engine.try_lock() {
                                Ok(mut e) => {
                                    if want != c.applied { e.opts = GestureOpts::from_sensitivity(want); }
                                    let any = e.layout.landmarks.iter().any(|l| l.enabled && !l.needs_review);
                                    let a = e.on_move(sample, paused);
                                    (a, any, e.progress())
                                }
                                Err(_) => (None, true, 0.0),
                            };
                            if let Ok(mut mt) = METER.try_lock() { *mt = Meter { frac: prog, x: sample.x, y: sample.y }; }
                            if want != c.applied { c.applied = want; c.legacy.set_opts(ShakeOpts::from_sens(want)); }
                            if let Some(a) = act {
                                let app = c.app.clone();
                                tauri::async_runtime::spawn(async move { crate::open_tool(&app, a.tool, a.x, a.y); });
                            } else if !any_landmark && !paused && !sample.injected && c.legacy.moved(sample.x, sample.y, t, down) {
                                let app = c.app.clone();
                                tauri::async_runtime::spawn(async move { crate::open_capture(&app); });
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        CallNextHookEx(HHOOK::default(), code, w, l)
    }

    let _ = CTX.set(Mutex::new(Ctx { app, enabled, level, applied: 50, engine, legacy: ShakeDetector::new(), t0: Instant::now(), buttons: 0, last_button: Instant::now() }));
    *status.lock().unwrap() = "starting".into();
    std::thread::spawn(move || unsafe {
        THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);
        let module = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).unwrap_or_default();
        let hh = match SetWindowsHookExW(WH_MOUSE_LL, Some(hook), module, 0) {
            Ok(h) => h,
            Err(e) => { *status.lock().unwrap() = format!("failed: {e}"); THREAD_ID.store(0, Ordering::SeqCst); return; }
        };
        *status.lock().unwrap() = "running".into();
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() { let _ = TranslateMessage(&msg); DispatchMessageW(&msg); }
        let _ = UnhookWindowsHookEx(hh);
        *status.lock().unwrap() = "stopped".into();
    });
}
