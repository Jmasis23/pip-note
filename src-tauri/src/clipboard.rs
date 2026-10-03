use pip_core::clipboard::History;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
const KEY: &str = "clipboard-history"; // Not exposed to store_load or cloud sync.
pub struct ClipboardState(pub Mutex<History>, pub std::sync::atomic::AtomicBool);
#[derive(Serialize)] pub struct Status { enabled: bool, items: Vec<pip_core::clipboard::Item>, supported: bool }
fn save(app: &AppHandle, h: &History) -> Result<(), String> {
    app.state::<crate::AppState>().kv.set(KEY, &serde_json::to_string(h).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
#[tauri::command] pub fn clipboard_status(st: State<ClipboardState>) -> Result<Status, String> {
    let h = st.0.lock().map_err(|_| "Clipboard history is busy")?;
    Ok(Status { enabled: h.enabled, items: h.items.clone(), supported: st.1.load(std::sync::atomic::Ordering::Relaxed) })
}
#[tauri::command] pub fn clipboard_enable(app: AppHandle, st: State<ClipboardState>, enabled: bool) -> Result<(), String> {
    if enabled && !st.1.load(std::sync::atomic::Ordering::Relaxed) { return Err("Clipboard history requires Windows".into()); }
    let mut h = st.0.lock().map_err(|_| "Clipboard history is busy")?;
    let mut next = h.clone(); next.enabled = enabled; save(&app, &next)?; *h = next; Ok(())
}
#[tauri::command] pub fn clipboard_delete(app: AppHandle, st: State<ClipboardState>, id: Option<u64>) -> Result<(), String> {
    let mut h = st.0.lock().map_err(|_| "Clipboard history is busy")?;
    let mut next = h.clone(); if let Some(id) = id { next.items.retain(|i| i.id != id); } else { next.items.clear(); }
    save(&app, &next)?; *h = next; Ok(())
}
#[tauri::command] pub fn clipboard_copy(st: State<ClipboardState>, id: u64) -> Result<(), String> {
    let text = st.0.lock().map_err(|_| "Clipboard history is busy")?.items.iter().find(|i| i.id == id).map(|i| i.text.clone()).ok_or("That item was removed")?;
    platform::copy(&text)
}
pub fn start(app: AppHandle) -> Result<(), String> {
    let raw = app.state::<crate::AppState>().kv.get(KEY).map_err(|e| e.to_string())?;
    let h: History = match raw { Some(s) => serde_json::from_str(&s).map_err(|e| format!("Clipboard history could not be read: {e}"))?, None => History::default() };
    app.manage(ClipboardState(Mutex::new(h), std::sync::atomic::AtomicBool::new(false))); platform::start(app); Ok(())
}
fn record(app: &AppHandle, text: String) {
    let st = app.state::<ClipboardState>(); if let Ok(mut h) = st.0.lock() {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        let mut next = h.clone(); if next.record(text, now) {
            match save(app, &next) { Ok(()) => { *h = next; let _ = app.emit("pip://clipboard-changed", ()); }, Err(_) => { h.enabled = false; let _ = app.emit("pip://clipboard-error", ()); } }
        }
    };
}
#[cfg(not(windows))] mod platform {
    use super::*;
    pub fn start(_: AppHandle) {}
    pub fn copy(_: &str) -> Result<(), String> { Err("Clipboard history requires Windows".into()) }
}
#[cfg(windows)] mod platform {
    use super::*;
    use std::ffi::c_void;
    type Handle = *mut c_void;
    #[repr(C)] struct Msg { hwnd: Handle, message: u32, wparam: usize, lparam: isize, time: u32, x: i32, y: i32, private: u32 }
    #[link(name = "user32")] extern "system" {
        fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32, x: i32, y: i32, w: i32, h: i32, parent: Handle, menu: Handle, instance: Handle, param: Handle) -> Handle;
        fn AddClipboardFormatListener(hwnd: Handle) -> i32;
        fn GetMessageW(msg: *mut Msg, hwnd: Handle, min: u32, max: u32) -> i32;
        fn DispatchMessageW(msg: *const Msg) -> isize;
        fn OpenClipboard(hwnd: Handle) -> i32; fn CloseClipboard() -> i32;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
        fn GetClipboardData(format: u32) -> Handle; fn EmptyClipboard() -> i32;
        fn SetClipboardData(format: u32, data: Handle) -> Handle;
        fn DestroyWindow(hwnd: Handle) -> i32;
    }
    #[link(name = "kernel32")] extern "system" {
        fn GlobalLock(mem: Handle) -> Handle; fn GlobalUnlock(mem: Handle) -> i32;
        fn GlobalSize(mem: Handle) -> usize; fn GlobalAlloc(flags: u32, size: usize) -> Handle; fn GlobalFree(mem: Handle) -> Handle;
    }
    fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }
    unsafe fn window() -> Handle { CreateWindowExW(0, wide("STATIC").as_ptr(), wide("Pip clipboard").as_ptr(), 0, 0, 0, 0, 0, -3isize as Handle, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut()) }
    unsafe fn open(hwnd: Handle) -> bool { for _ in 0..5 { if OpenClipboard(hwnd) != 0 { return true; } std::thread::sleep(std::time::Duration::from_millis(20)); } false }
    pub fn start(app: AppHandle) { std::thread::spawn(move || unsafe {
        let hwnd = window(); if hwnd.is_null() || AddClipboardFormatListener(hwnd) == 0 { app.state::<ClipboardState>().0.lock().map(|mut h| h.enabled = false).ok(); let _ = app.emit("pip://clipboard-error", ()); return; }
        app.state::<ClipboardState>().1.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = app.emit("pip://clipboard-changed", ());
        let exclude = RegisterClipboardFormatW(wide("ExcludeClipboardContentFromMonitorProcessing").as_ptr());
        let mut msg: Msg = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            if msg.message == 0x031D && app.state::<ClipboardState>().0.lock().map(|h| h.enabled).unwrap_or(false) && open(hwnd) {
                let mut text = None;
                if IsClipboardFormatAvailable(13) != 0 && (exclude == 0 || IsClipboardFormatAvailable(exclude) == 0) {
                    let data = GetClipboardData(13); let size = GlobalSize(data) / 2;
                    if !data.is_null() && size > 0 && size <= 40_002 {
                        let ptr = GlobalLock(data) as *const u16;
                        if !ptr.is_null() { let slice = std::slice::from_raw_parts(ptr, size); let len = slice.iter().position(|c| *c == 0).unwrap_or(size); text = Some(String::from_utf16_lossy(&slice[..len])); GlobalUnlock(data); }
                    }
                }
                CloseClipboard(); if let Some(text) = text { record(&app, text); }
            }
            DispatchMessageW(&msg);
        }
        DestroyWindow(hwnd);
    }); }
    pub fn copy(text: &str) -> Result<(), String> { unsafe {
        let hwnd = window(); if hwnd.is_null() { return Err("Couldn't open the clipboard".into()); }
        let result = (|| {
            let data = wide(text); let mem = GlobalAlloc(2, data.len() * 2); if mem.is_null() { return Err("Couldn't copy this item".into()); }
            let ptr = GlobalLock(mem) as *mut u16; if ptr.is_null() { GlobalFree(mem); return Err("Couldn't copy this item".into()); }
            std::ptr::copy_nonoverlapping(data.as_ptr(), ptr, data.len()); GlobalUnlock(mem);
            if !open(hwnd) { GlobalFree(mem); return Err("Clipboard is busy. Try again".into()); }
            let ok = EmptyClipboard() != 0 && !SetClipboardData(13, mem).is_null(); CloseClipboard();
            if !ok { GlobalFree(mem); return Err("Couldn't copy this item".into()); } Ok(())
        })(); DestroyWindow(hwnd); result
    } }
}
