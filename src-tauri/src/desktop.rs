//! Click-only desktop tabs. A small background sampler follows monitors and suppresses fullscreen overlays.
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Deserialize)]
pub struct Surface {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Default)]
pub struct DesktopState {
    pub surfaces: Mutex<Vec<Surface>>,
    pub ready: std::sync::atomic::AtomicBool,
    pub suppressed: std::sync::atomic::AtomicBool,
}

#[tauri::command]
pub fn desktop_regions(
    w: tauri::WebviewWindow,
    st: State<DesktopState>,
    surfaces: Vec<Surface>,
) -> Result<(), String> {
    if w.label() != "desktop-dock" {
        return Err("Unexpected window".into());
    }
    if surfaces.len() > 128
        || surfaces.iter().any(|r| {
            ![r.x, r.y, r.width, r.height].iter().all(|n| n.is_finite())
                || r.width < 0.0
                || r.height < 0.0
        })
    {
        return Err("Invalid regions".into());
    }
    #[cfg(windows)]
    native::regions(&w, &surfaces)?;
    if surfaces.is_empty() {
        let _ = w.hide();
    }
    *st.surfaces.lock().map_err(|_| "busy")? = surfaces;
    st.ready.store(true, std::sync::atomic::Ordering::Relaxed);
    #[cfg(windows)]
    if !st.suppressed.load(std::sync::atomic::Ordering::Relaxed)
        && !st.surfaces.lock().map_err(|_| "busy")?.is_empty()
    {
        native::show_without_focus(&w);
    }
    Ok(())
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(windows)]
    {
        tauri::WebviewWindowBuilder::new(
            app,
            "desktop-dock",
            tauri::WebviewUrl::App("index.html?desktop-dock=1".into()),
        )
        .title("Pip dock")
        .inner_size(600.0, 700.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
        native::start(app.clone());
    }
    Ok(())
}

#[cfg(windows)]
mod native {
    use super::*;
    use std::{mem::size_of, sync::atomic::Ordering, time::Duration};
    use windows::Win32::{
        Foundation::{HWND, POINT, RECT},
        Graphics::Gdi::*,
        UI::WindowsAndMessaging::*,
    };

    pub fn show_without_focus(w: &tauri::WebviewWindow) {
        use windows::Win32::UI::WindowsAndMessaging::*;
        if let Ok(h) = w.hwnd().map(|h| HWND(h.0)) {
            unsafe {
                let _ = SetWindowPos(
                    h,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
            }
        }
    }
    pub fn regions(w: &tauri::WebviewWindow, surfaces: &[Surface]) -> Result<(), String> {
        let scale = w.scale_factor().map_err(|e| e.to_string())?;
        let hwnd = w.hwnd().map(|h| HWND(h.0)).map_err(|e| e.to_string())?;
        unsafe {
            let region = CreateRectRgn(0, 0, 0, 0);
            if region.is_invalid() {
                return Err("Couldn't create dock region".into());
            }
            for r in surfaces {
                let (left, top, right, bottom) =
                    crate::desktop_geometry::physical_rect((r.x, r.y, r.width, r.height), scale);
                let part = CreateRectRgn(left, top, right, bottom);
                CombineRgn(region, region, part, RGN_OR);
                let _ = DeleteObject(part);
            }
            if SetWindowRgn(hwnd, region, true) == 0 {
                let _ = DeleteObject(region);
                return Err("Couldn't apply dock region".into());
            }
        }
        Ok(())
    }
    // Borderless foreground windows covering the complete monitor are treated conservatively as fullscreen.
    unsafe fn fullscreen(monitor: &RECT, fg: HWND, app: &AppHandle) -> bool {
        if fg.is_invalid() {
            return false;
        }
        if app
            .webview_windows()
            .values()
            .any(|w| w.hwnd().ok().map(|h| HWND(h.0)) == Some(fg))
        {
            return false;
        }
        let mut name = [0u16; 64];
        let len = GetClassNameW(fg, &mut name) as usize;
        let name = String::from_utf16_lossy(&name[..len]);
        if matches!(
            name.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        ) {
            return false;
        }
        let mut r = RECT::default();
        GetWindowRect(fg, &mut r).is_ok()
            && r.left <= monitor.left
            && r.top <= monitor.top
            && r.right >= monitor.right
            && r.bottom >= monitor.bottom
            && GetWindowLongW(fg, GWL_STYLE) as u32 & WS_CAPTION.0 == 0
    }
    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            let mut last_area = None;
            let mut hidden_for_fullscreen = false;
            let mut hidden_notes = std::collections::HashSet::new();
            loop {
                std::thread::sleep(Duration::from_millis(100));
                let Some(w) = app.get_webview_window("desktop-dock") else {
                    break;
                };
                let st = app.state::<DesktopState>();
                if !st.ready.load(Ordering::Relaxed) {
                    continue;
                }
                unsafe {
                    let mut p = POINT::default();
                    if GetCursorPos(&mut p).is_err() {
                        continue;
                    }
                    let monitor = MonitorFromPoint(p, MONITOR_DEFAULTTONULL);
                    if monitor.is_invalid() {
                        continue;
                    }
                    let mut info = MONITORINFO {
                        cbSize: size_of::<MONITORINFO>() as u32,
                        ..Default::default()
                    };
                    if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                        continue;
                    }
                    let fg = GetForegroundWindow();
                    let full = fullscreen(&info.rcMonitor, fg, &app);
                    for (label, note) in app
                        .webview_windows()
                        .into_iter()
                        .filter(|(label, _)| label.starts_with("note-"))
                    {
                        if let Ok(h) = note.hwnd().map(|h| HWND(h.0)) {
                            let nm = MonitorFromWindow(h, MONITOR_DEFAULTTONULL);
                            let mut ni = MONITORINFO {
                                cbSize: size_of::<MONITORINFO>() as u32,
                                ..Default::default()
                            };
                            let blocked = GetMonitorInfoW(nm, &mut ni).as_bool()
                                && fullscreen(&ni.rcMonitor, fg, &app);
                            if blocked && note.is_visible().unwrap_or(false) {
                                let _ = note.hide();
                                hidden_notes.insert(label);
                            } else if !blocked && hidden_notes.remove(&label) {
                                let _ = SetWindowPos(
                                    h,
                                    HWND_TOPMOST,
                                    0,
                                    0,
                                    0,
                                    0,
                                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                                );
                            }
                        }
                    }

                    // Also hide retained cards when a fullscreen app is on their monitor.
                    let dock_full = w
                        .hwnd()
                        .ok()
                        .map(|h| HWND(h.0))
                        .map(|h| {
                            let dm = MonitorFromWindow(h, MONITOR_DEFAULTTONULL);
                            let mut di = MONITORINFO {
                                cbSize: size_of::<MONITORINFO>() as u32,
                                ..Default::default()
                            };
                            GetMonitorInfoW(dm, &mut di).as_bool()
                                && fullscreen(&di.rcMonitor, fg, &app)
                        })
                        .unwrap_or(false);
                    st.suppressed.store(full || dock_full, Ordering::Relaxed);
                    if full || dock_full {
                        let _ = w.hide();
                        hidden_for_fullscreen = true;
                    } else if hidden_for_fullscreen {
                        hidden_for_fullscreen = false;
                        if let Ok(h) = w.hwnd().map(|h| HWND(h.0)) {
                            let _ = SetWindowPos(
                                h,
                                HWND_TOPMOST,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                        }
                    }
                    // Monitor tracking never opens Pip. Preserve open/pinned panels on their monitor.
                    // A collapsed host may leave a fullscreen monitor for an unobstructed one.
                    let area = (
                        info.rcWork.left,
                        info.rcWork.top,
                        info.rcWork.right,
                        info.rcWork.bottom,
                    );
                    let collapsed = st
                        .surfaces
                        .lock()
                        .map(|surfaces| surfaces.len() <= 2)
                        .unwrap_or(false);
                    if !full && collapsed && last_area != Some(area) {
                        let _ = w.set_position(tauri::PhysicalPosition::new(area.0, area.1));
                        let _ = w.set_size(tauri::PhysicalSize::new(
                            (area.2 - area.0) as u32,
                            (area.3 - area.1) as u32,
                        ));
                        last_area = Some(area);
                    }
                }
            }
        });
    }
}

#[tauri::command]
pub async fn desktop_float(app: AppHandle, id: String) -> Result<(), String> {
    if id.is_empty() || id.len() > 100 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid note".into());
    }
    let label = format!("note-{id}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let w = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(format!("index.html?floating={id}").into()),
    )
    .title("Pip note")
    .inner_size(454.0, 604.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    if let Some(dock) = app.get_webview_window("desktop-dock") {
        if let Ok(Some(m)) = dock.current_monitor() {
            let area = m.work_area();
            let scale = m.scale_factor();
            let margin = (12.0 * scale) as u32;
            let width = ((454.0 * scale) as u32)
                .min(area.size.width.saturating_sub(margin * 2))
                .max(1);
            let height = ((604.0 * scale) as u32)
                .min(area.size.height.saturating_sub(margin * 2))
                .max(1);
            let _ = w.set_size(tauri::PhysicalSize::new(width, height));
            let left = area
                .size
                .width
                .saturating_sub(width + (84.0 * scale) as u32)
                .max(margin);
            let top = ((72.0 * scale) as u32).min(area.size.height.saturating_sub(height + margin));
            let _ = w.set_position(tauri::PhysicalPosition::new(
                area.position.x + left as i32,
                area.position.y + top as i32,
            ));
        }
    }
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_redock(app: AppHandle, w: tauri::WebviewWindow, id: String) -> Result<(), String> {
    if w.label() != format!("note-{id}") {
        return Err("Unexpected note window".into());
    }
    app.emit_to("desktop-dock", "pip://redock", id)
        .map_err(|e| e.to_string())?;
    w.hide().map_err(|e| e.to_string())?;
    if let Some(dock) = app.get_webview_window("desktop-dock") {
        dock.show().map_err(|e| e.to_string())?;
        dock.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn refresh_regions(w: &tauri::WebviewWindow) {
    if w.label() != "desktop-dock" {
        return;
    }
    #[cfg(windows)]
    {
        let st = w.app_handle().state::<DesktopState>();
        if let Ok(surfaces) = st.surfaces.lock() {
            let _ = native::regions(w, &surfaces);
        };
    }
}

#[tauri::command]
pub fn desktop_dashboard(app: AppHandle, w: tauri::WebviewWindow) -> Result<(), String> {
    if w.label() != "desktop-dock" {
        return Err("Unexpected window".into());
    }
    crate::show_main(&app);
    Ok(())
}
