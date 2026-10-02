//! System-wide mouse shake. A low-level mouse hook (mouse only, no keyboard hook) feeds the detector.
//! Windows only. Elsewhere this is a no-op so the crate still builds for development.
use std::sync::{atomic::AtomicBool, Arc};
use tauri::AppHandle;

#[cfg(not(windows))]
pub fn start(_app: AppHandle, _enabled: Arc<AtomicBool>) {}

#[cfg(windows)]
pub fn start(app: AppHandle, enabled: Arc<AtomicBool>) {
    use pip_core::gesture::ShakeDetector;
    use std::sync::atomic::Ordering;
    use std::sync::{Mutex, OnceLock};
    use std::time::Instant;
    use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::*;

    struct Ctx { app: AppHandle, enabled: Arc<AtomicBool>, det: ShakeDetector, t0: Instant, buttons: i32, last_button: Instant }
    static CTX: OnceLock<Mutex<Ctx>> = OnceLock::new();

    unsafe extern "system" fn hook(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code >= 0 {
            if let Some(m) = CTX.get() {
                if let Ok(mut c) = m.try_lock() {
                    match w.0 as u32 {
                        WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN => { c.buttons += 1; c.last_button = Instant::now(); }
                        WM_LBUTTONUP | WM_RBUTTONUP | WM_MBUTTONUP => { c.buttons = (c.buttons - 1).max(0); c.last_button = Instant::now(); }
                        WM_MOUSEMOVE => {
                            // A missed button-up must not disable the gesture forever.
                            if c.buttons > 0 && c.last_button.elapsed().as_secs() > 8 { c.buttons = 0; }
                            if c.enabled.load(Ordering::Relaxed) {
                                let ms = &*(l.0 as *const MSLLHOOKSTRUCT);
                                let t = c.t0.elapsed().as_secs_f64() * 1000.0;
                                let down = c.buttons > 0;
                                if c.det.moved(ms.pt.x as f64, ms.pt.y as f64, t, down) {
                                    let app = c.app.clone();
                                    tauri::async_runtime::spawn(async move { crate::open_capture(&app); });
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        CallNextHookEx(HHOOK::default(), code, w, l)
    }

    let _ = CTX.set(Mutex::new(Ctx { app, enabled, det: ShakeDetector::new(), t0: Instant::now(), buttons: 0, last_button: Instant::now() }));
    std::thread::spawn(|| unsafe {
        let module = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).unwrap_or_default();
        if SetWindowsHookExW(WH_MOUSE_LL, Some(hook), module, 0).is_err() { return; }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() { let _ = TranslateMessage(&msg); DispatchMessageW(&msg); }
    });
}
