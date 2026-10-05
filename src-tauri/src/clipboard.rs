use pip_core::clipboard::History;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
const KEY: &str = "clipboard-history"; // Not exposed to store_load or cloud sync.
pub struct ClipboardState(pub Mutex<History>, pub std::sync::atomic::AtomicBool);
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct Config {
    pub pinned: Vec<u64>,
    pub limit: usize,
    pub days: u64,
    pub exclusions: Vec<String>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            pinned: vec![],
            limit: 50,
            days: 7,
            exclusions: vec![],
        }
    }
}
pub struct ClipboardConfig(pub Mutex<Config>);
#[tauri::command]
pub fn clipboard_config(app: AppHandle, config: Option<Config>) -> Result<Config, String> {
    let st = app.state::<ClipboardConfig>();
    let mut cur = st.0.lock().map_err(|e| e.to_string())?;
    if let Some(c) = config {
        if c.limit < 10 || c.limit > 50 || c.days < 1 || c.days > 90 || c.pinned.len() > 50 {
            return Err("Use 10–50 items, 1–90 days, and at most 50 pins.".into());
        }
        app.state::<crate::AppState>().kv.set(
            "clipboard-config",
            &serde_json::to_string(&c).map_err(|e| e.to_string())?,
        )?;
        *cur = c;
    }
    Ok(cur.clone())
}
#[derive(Serialize)]
pub struct Status {
    enabled: bool,
    items: Vec<pip_core::clipboard::Item>,
    supported: bool,
}
fn save(app: &AppHandle, h: &History) -> Result<(), String> {
    app.state::<crate::AppState>()
        .kv
        .set(KEY, &serde_json::to_string(h).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn clipboard_status(app: AppHandle, st: State<ClipboardState>) -> Result<Status, String> {
    let mut h = st.0.lock().map_err(|_| "Clipboard history is busy")?;
    let cfg = app
        .state::<ClipboardConfig>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let mut next = h.clone();
    next.items.retain(|i| {
        cfg.pinned.contains(&i.id) || now.saturating_sub(i.copied_at) <= cfg.days * 86400000
    });
    let mut count = 0;
    next.items.retain(|i| {
        if cfg.pinned.contains(&i.id) {
            true
        } else {
            count += 1;
            count <= cfg.limit
        }
    });
    if next.items.len() != h.items.len() {
        save(&app, &next)?;
        *h = next;
    }
    Ok(Status {
        enabled: h.enabled,
        items: h.items.clone(),
        supported: st.1.load(std::sync::atomic::Ordering::Relaxed),
    })
}
#[tauri::command]
pub fn clipboard_enable(
    app: AppHandle,
    st: State<ClipboardState>,
    enabled: bool,
) -> Result<(), String> {
    if enabled && !st.1.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Clipboard history requires Windows".into());
    }
    let mut h = st.0.lock().map_err(|_| "Clipboard history is busy")?;
    let mut next = h.clone();
    next.enabled = enabled;
    save(&app, &next)?;
    *h = next;
    Ok(())
}
#[tauri::command]
pub fn clipboard_delete(
    app: AppHandle,
    st: State<ClipboardState>,
    id: Option<u64>,
) -> Result<(), String> {
    let mut h = st.0.lock().map_err(|_| "Clipboard history is busy")?;
    let mut next = h.clone();
    if let Some(id) = id {
        next.items.retain(|i| i.id != id);
    } else {
        next.items.clear();
    }
    save(&app, &next)?;
    *h = next;
    Ok(())
}
#[tauri::command]
pub fn clipboard_copy(st: State<ClipboardState>, id: u64) -> Result<(), String> {
    let item =
        st.0.lock()
            .map_err(|_| "Clipboard history is busy")?
            .items
            .iter()
            .find(|i| i.id == id)
            .cloned()
            .ok_or("That item was removed")?;
    platform::copy(&item)
}
pub fn start(app: AppHandle) -> Result<(), String> {
    let raw = app
        .state::<crate::AppState>()
        .kv
        .get(KEY)
        .map_err(|e| e.to_string())?;
    let h: History = match raw {
        Some(s) => serde_json::from_str(&s)
            .map_err(|e| format!("Clipboard history could not be read: {e}"))?,
        None => History::default(),
    };
    let config = app
        .state::<crate::AppState>()
        .kv
        .get("clipboard-config")?
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    app.manage(ClipboardConfig(Mutex::new(config)));
    app.manage(ClipboardState(
        Mutex::new(h),
        std::sync::atomic::AtomicBool::new(false),
    ));
    platform::start(app);
    Ok(())
}
fn record(app: &AppHandle, text: Option<String>, png: Option<Vec<u8>>) {
    let st = app.state::<ClipboardState>();
    if let Ok(mut h) = st.0.lock() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let cfg = app
            .state::<ClipboardConfig>()
            .0
            .lock()
            .map(|c| c.clone())
            .unwrap_or_default();
        let (name, _) = crate::shake::foreground();
        if cfg.exclusions.iter().any(|x| x.eq_ignore_ascii_case(&name)) {
            return;
        }
        let pinned: Vec<_> = h
            .items
            .iter()
            .filter(|i| cfg.pinned.contains(&i.id))
            .cloned()
            .collect();
        let mut next = h.clone();
        next.items.retain(|i| {
            now.saturating_sub(i.copied_at) <= cfg.days * 86400000 || cfg.pinned.contains(&i.id)
        });
        if if let Some(png) = png {
            next.record_image(&png, now)
        } else if let Some(text) = text {
            next.record(text, now)
        } else {
            false
        } {
            for pin in pinned {
                if !next.items.iter().any(|i| i.id == pin.id) {
                    next.items.push(pin);
                }
            }
            let mut unpinned = 0;
            next.items.retain(|i| {
                if cfg.pinned.contains(&i.id) {
                    true
                } else {
                    unpinned += 1;
                    unpinned <= cfg.limit
                }
            });
            match save(app, &next) {
                Ok(()) => {
                    *h = next;
                    let _ = app.emit("pip://clipboard-changed", ());
                }
                Err(_) => {
                    h.enabled = false;
                    let _ = app.emit("pip://clipboard-error", ());
                }
            }
        }
    };
}
#[tauri::command]
pub fn clipboard_text(text: String) -> Result<(), String> {
    platform::copy(&pip_core::clipboard::Item {
        id: 0,
        text,
        image: None,
        copied_at: 0,
    })
}
pub fn reload(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<ClipboardState>();
    let raw = app.state::<crate::AppState>().kv.get(KEY)?;
    *state.0.lock().map_err(|e| e.to_string())? = raw
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let cfg = app
        .state::<crate::AppState>()
        .kv
        .get("clipboard-config")?
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    *app.state::<ClipboardConfig>()
        .0
        .lock()
        .map_err(|e| e.to_string())? = cfg;
    Ok(())
}
pub fn stop() {
    platform::stop();
}
#[cfg(not(windows))]
mod platform {
    pub fn stop() {}
    use super::*;
    pub fn start(_: AppHandle) {}
    pub fn copy(_: &pip_core::clipboard::Item) -> Result<(), String> {
        Err("Clipboard history requires Windows".into())
    }
}
#[cfg(windows)]
mod platform {
    static THREAD: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    pub fn stop() {
        let id = THREAD.swap(0, std::sync::atomic::Ordering::SeqCst);
        if id != 0 {
            unsafe {
                PostThreadMessageW(id, 0x0012, 0, 0);
            }
        }
    }
    use super::*;
    use std::ffi::c_void;
    type Handle = *mut c_void;
    #[repr(C)]
    struct Msg {
        hwnd: Handle,
        message: u32,
        wparam: usize,
        lparam: isize,
        time: u32,
        x: i32,
        y: i32,
        private: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn CreateWindowExW(
            ex: u32,
            class: *const u16,
            title: *const u16,
            style: u32,
            x: i32,
            y: i32,
            w: i32,
            h: i32,
            parent: Handle,
            menu: Handle,
            instance: Handle,
            param: Handle,
        ) -> Handle;
        fn AddClipboardFormatListener(hwnd: Handle) -> i32;
        fn RemoveClipboardFormatListener(hwnd: Handle) -> i32;
        fn PostThreadMessageW(id: u32, msg: u32, w: usize, l: isize) -> i32;
        fn GetMessageW(msg: *mut Msg, hwnd: Handle, min: u32, max: u32) -> i32;
        fn DispatchMessageW(msg: *const Msg) -> isize;
        fn OpenClipboard(hwnd: Handle) -> i32;
        fn CloseClipboard() -> i32;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
        fn GetClipboardData(format: u32) -> Handle;
        fn EmptyClipboard() -> i32;
        fn SetClipboardData(format: u32, data: Handle) -> Handle;
        fn DestroyWindow(hwnd: Handle) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentThreadId() -> u32;
        fn GlobalLock(mem: Handle) -> Handle;
        fn GlobalUnlock(mem: Handle) -> i32;
        fn GlobalSize(mem: Handle) -> usize;
        fn GlobalAlloc(flags: u32, size: usize) -> Handle;
        fn GlobalFree(mem: Handle) -> Handle;
    }
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }
    unsafe fn window() -> Handle {
        CreateWindowExW(
            0,
            wide("STATIC").as_ptr(),
            wide("Pip clipboard").as_ptr(),
            0,
            0,
            0,
            0,
            0,
            -3isize as Handle,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    }
    unsafe fn open(hwnd: Handle) -> bool {
        for _ in 0..5 {
            if OpenClipboard(hwnd) != 0 {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        false
    }
    pub fn start(app: AppHandle) {
        std::thread::spawn(move || unsafe {
            THREAD.store(GetCurrentThreadId(), std::sync::atomic::Ordering::SeqCst);
            let hwnd = window();
            if hwnd.is_null() || AddClipboardFormatListener(hwnd) == 0 {
                app.state::<ClipboardState>()
                    .0
                    .lock()
                    .map(|mut h| h.enabled = false)
                    .ok();
                let _ = app.emit("pip://clipboard-error", ());
                return;
            }
            app.state::<ClipboardState>()
                .1
                .store(true, std::sync::atomic::Ordering::Relaxed);
            let _ = app.emit("pip://clipboard-changed", ());
            let png_format = RegisterClipboardFormatW(wide("PNG").as_ptr());
            let exclude = RegisterClipboardFormatW(
                wide("ExcludeClipboardContentFromMonitorProcessing").as_ptr(),
            );
            let mut msg: Msg = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                if msg.message == 0x031D
                    && app
                        .state::<ClipboardState>()
                        .0
                        .lock()
                        .map(|h| h.enabled)
                        .unwrap_or(false)
                    && open(hwnd)
                {
                    let mut text = None;
                    let mut png = None;
                    if exclude == 0 || IsClipboardFormatAvailable(exclude) == 0 {
                        // Prefer images over incidental text offered by browsers alongside an image.
                        if png_format != 0 && IsClipboardFormatAvailable(png_format) != 0 {
                            if let Some(data) =
                                read_bytes(png_format, pip_core::clipboard::MAX_IMAGE_BYTES)
                            {
                                png = pip_core::clipboard_image::normalize_png(&data).ok();
                            }
                        }
                        if png.is_none() {
                            for format in [17, 8] {
                                // CF_DIBV5, CF_DIB. Snipping Tool normally supplies these.
                                if IsClipboardFormatAvailable(format) != 0 {
                                    if let Some(data) = read_bytes(format, 32_001_024) {
                                        png = pip_core::clipboard_image::dib_to_png(&data).ok();
                                    }
                                    if png.is_some() {
                                        break;
                                    }
                                }
                            }
                        }
                        if png.is_none() && IsClipboardFormatAvailable(13) != 0 {
                            if let Some(data) = read_bytes(13, 80_004) {
                                let units: Vec<u16> = data
                                    .as_chunks::<2>()
                                    .0
                                    .iter()
                                    .map(|b| u16::from_le_bytes([b[0], b[1]]))
                                    .take_while(|c| *c != 0)
                                    .collect();
                                text = Some(String::from_utf16_lossy(&units));
                            }
                        }
                    }
                    CloseClipboard();
                    record(&app, text, png);
                }
                DispatchMessageW(&msg);
            }
            RemoveClipboardFormatListener(hwnd);
            DestroyWindow(hwnd);
            THREAD.store(0, std::sync::atomic::Ordering::SeqCst);
        });
    }
    unsafe fn read_bytes(format: u32, max: usize) -> Option<Vec<u8>> {
        let mem = GetClipboardData(format);
        if mem.is_null() {
            return None;
        }
        let size = GlobalSize(mem);
        if size == 0 || size > max {
            return None;
        }
        let ptr = GlobalLock(mem) as *const u8;
        if ptr.is_null() {
            return None;
        }
        let bytes = std::slice::from_raw_parts(ptr, size).to_vec();
        GlobalUnlock(mem);
        Some(bytes)
    }
    unsafe fn allocate(bytes: &[u8]) -> Result<Handle, String> {
        let mem = GlobalAlloc(2, bytes.len());
        if mem.is_null() {
            return Err("Couldn't copy this item".into());
        }
        let ptr = GlobalLock(mem) as *mut u8;
        if ptr.is_null() {
            GlobalFree(mem);
            return Err("Couldn't copy this item".into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
        GlobalUnlock(mem);
        Ok(mem)
    }
    pub fn copy(item: &pip_core::clipboard::Item) -> Result<(), String> {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let formats: Vec<(u32, Vec<u8>)> = if let Some(image) = &item.image {
            let png = STANDARD
                .decode(
                    image
                        .strip_prefix("data:image/png;base64,")
                        .ok_or("Invalid image")?,
                )
                .map_err(|_| "Invalid image")?;
            let dib = pip_core::clipboard_image::png_to_dib(&png)?;
            let format = unsafe { RegisterClipboardFormatW(wide("PNG").as_ptr()) };
            if format == 0 {
                return Err("Couldn't copy this image".into());
            }
            vec![(format, png), (17, dib)]
        } else {
            vec![(
                13,
                wide(&item.text)
                    .iter()
                    .flat_map(|c| c.to_le_bytes())
                    .collect(),
            )]
        };
        unsafe {
            let hwnd = window();
            if hwnd.is_null() {
                return Err("Couldn't open the clipboard".into());
            }
            let result = (|| {
                let mut owned = Vec::new();
                for (format, bytes) in &formats {
                    match allocate(bytes) {
                        Ok(mem) => owned.push((*format, mem)),
                        Err(e) => {
                            for (_, mem) in owned {
                                GlobalFree(mem);
                            }
                            return Err(e);
                        }
                    }
                }
                if !open(hwnd) {
                    for (_, mem) in owned {
                        GlobalFree(mem);
                    }
                    return Err("Clipboard is busy. Try again".into());
                }
                if EmptyClipboard() == 0 {
                    CloseClipboard();
                    for (_, mem) in owned {
                        GlobalFree(mem);
                    }
                    return Err("Couldn't copy this item".into());
                }
                let mut all = true;
                for (format, mem) in owned {
                    if SetClipboardData(format, mem).is_null() {
                        GlobalFree(mem);
                        all = false;
                    }
                }
                CloseClipboard();
                if all {
                    Ok(())
                } else {
                    Err("Couldn't copy all image formats. Try again".into())
                }
            })();
            DestroyWindow(hwnd);
            result
        }
    }
}
