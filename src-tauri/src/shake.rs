//! Windows low-level hook only collects into a bounded queue. Recognition and UI dispatch run off-hook.
use pip_core::landmarks::Engine;
use std::sync::{
    atomic::{AtomicBool, AtomicU8, Ordering},
    Arc, Mutex,
};
use tauri::AppHandle;
pub type Status = Arc<Mutex<String>>;
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct Policy {
    pub exclusions: Vec<String>,
    pub fullscreen: bool,
}
impl Default for Policy {
    fn default() -> Self {
        Self {
            exclusions: vec![],
            fullscreen: true,
        }
    }
}
#[cfg(not(windows))]
pub fn start(
    _: AppHandle,
    _: Arc<AtomicBool>,
    _: Arc<AtomicU8>,
    _: Arc<Mutex<Engine>>,
    status: Status,
    _: Arc<Mutex<Policy>>,
    _: Arc<AtomicBool>,
) {
    if let Ok(mut s) = status.lock() {
        *s = "unsupported (Windows required)".into();
    }
}
#[cfg(not(windows))]
pub fn stop() {}
#[cfg(windows)]
static THREAD: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
#[cfg(windows)]
pub fn stop() {
    use windows::Win32::{
        Foundation::{LPARAM, WPARAM},
        UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT},
    };
    let id = THREAD.swap(0, Ordering::SeqCst);
    if id != 0 {
        unsafe {
            let _ = PostThreadMessageW(id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}
#[cfg(windows)]
pub fn foreground() -> (String, bool) {
    use windows::Win32::{
        Foundation::{CloseHandle, RECT},
        Graphics::Gdi::*,
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::*,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let mut name = String::new();
        if let Ok(p) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            if QueryFullProcessImageNameW(
                p,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .is_ok()
            {
                name = String::from_utf16_lossy(&buf[..len as usize])
                    .rsplit(['\\', '/'])
                    .next()
                    .unwrap_or("")
                    .to_lowercase();
            }
            let _ = CloseHandle(p);
        }
        let mut rect = RECT::default();
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let full = GetWindowRect(hwnd, &mut rect).is_ok()
            && GetMonitorInfoW(mon, &mut info).as_bool()
            && rect.left <= info.rcMonitor.left
            && rect.top <= info.rcMonitor.top
            && rect.right >= info.rcMonitor.right
            && rect.bottom >= info.rcMonitor.bottom;
        (name, full)
    }
}
#[cfg(not(windows))]
pub fn foreground() -> (String, bool) {
    (String::new(), false)
}
#[cfg(windows)]
pub fn start(
    app: AppHandle,
    enabled: Arc<AtomicBool>,
    _level: Arc<AtomicU8>,
    engine: Arc<Mutex<Engine>>,
    status: Status,
    policy: Arc<Mutex<Policy>>,
    running: Arc<AtomicBool>,
) {
    use pip_core::landmarks::Sample;
    use std::{
        sync::{
            mpsc::{sync_channel, SyncSender},
            OnceLock,
        },
        time::Instant,
    };
    use windows::Win32::{
        Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM},
        System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
        UI::WindowsAndMessaging::*,
    };
    struct Input {
        tx: SyncSender<Sample>,
        t0: Instant,
        buttons: u8,
    }
    static INPUT: OnceLock<Mutex<Input>> = OnceLock::new();
    unsafe extern "system" fn hook(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code >= 0 {
            if let Some(input) = INPUT.get() {
                if let Ok(mut c) = input.try_lock() {
                    let msg = w.0 as u32;
                    match msg {
                        WM_LBUTTONDOWN => c.buttons |= 1,
                        WM_LBUTTONUP => c.buttons &= !1,
                        WM_RBUTTONDOWN => c.buttons |= 2,
                        WM_RBUTTONUP => c.buttons &= !2,
                        WM_MBUTTONDOWN => c.buttons |= 4,
                        WM_MBUTTONUP => c.buttons &= !4,
                        WM_XBUTTONDOWN => c.buttons |= 8,
                        WM_XBUTTONUP => c.buttons &= !8,
                        _ => {}
                    }
                    if msg == WM_MOUSEMOVE {
                        let ms = &*(l.0 as *const MSLLHOOKSTRUCT);
                        let _ = c.tx.try_send(Sample {
                            x: ms.pt.x as f64,
                            y: ms.pt.y as f64,
                            t_ms: c.t0.elapsed().as_secs_f64() * 1000.0,
                            button_down: c.buttons != 0,
                            injected: ms.flags & 3 != 0,
                        });
                    }
                }
            }
        }
        CallNextHookEx(HHOOK::default(), code, w, l)
    }
    let (tx, rx) = sync_channel(256);
    let _ = INPUT.set(Mutex::new(Input {
        tx,
        t0: Instant::now(),
        buttons: 0,
    }));
    let live = running.clone();
    std::thread::spawn(move || {
        let mut last_check = Instant::now() - std::time::Duration::from_secs(1);
        let mut suppressed = false;
        while live.load(Ordering::Relaxed) {
            let Ok(s) = rx.recv_timeout(std::time::Duration::from_millis(100)) else {
                continue;
            };
            if last_check.elapsed().as_millis() > 150 {
                let (name, full) = foreground();
                if let Ok(p) = policy.lock() {
                    suppressed = (p.fullscreen && full)
                        || p.exclusions.iter().any(|x| x.eq_ignore_ascii_case(&name));
                }
                last_check = Instant::now();
            }
            let a = engine
                .lock()
                .ok()
                .and_then(|mut e| e.on_move(s, suppressed || !enabled.load(Ordering::Relaxed)));
            if let Some(a) = a {
                crate::open_tool(&app, a.tool, a.x, a.y, Some(a.landmark_id));
            }
        }
    });
    std::thread::spawn(move || unsafe {
        THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
        let module = GetModuleHandleW(None)
            .map(|m| HINSTANCE(m.0))
            .unwrap_or_default();
        let hh = match SetWindowsHookExW(WH_MOUSE_LL, Some(hook), module, 0) {
            Ok(h) => h,
            Err(e) => {
                if let Ok(mut s) = status.lock() {
                    *s = format!("failed: {e}");
                }
                THREAD.store(0, Ordering::SeqCst);
                return;
            }
        };
        if let Ok(mut s) = status.lock() {
            *s = "running".into();
        }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = UnhookWindowsHookEx(hh);
        if let Ok(mut s) = status.lock() {
            *s = "stopped".into();
        }
    });
}
