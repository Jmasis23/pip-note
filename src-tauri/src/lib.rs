mod capture_bounds;
mod clipboard;
mod shake;
use pip_core::{
    kv::FileKv,
    landmarks::{self, Engine, GestureOpts, Landmark, Layout, Tool},
    sqlite::SqliteKv,
};
use std::{
    collections::HashMap,
    str::FromStr,
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        Arc, Mutex,
    },
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
struct AppState {
    kv: SqliteKv,
    shake: Arc<AtomicBool>,
    level: Arc<AtomicU8>,
    engine: Arc<Mutex<Engine>>,
    gesture_status: shake::Status,
    policy: Arc<Mutex<shake::Policy>>,
    running: Arc<AtomicBool>,
    previous: Mutex<isize>,
    testing: AtomicBool,
    saved_layout: Mutex<Option<Layout>>,
    overlay_layout: Mutex<Option<Layout>>,
    shortcut_errors: Mutex<Vec<String>>,
}
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
fn monitors(app: &AppHandle) -> Vec<landmarks::Monitor> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let (p, z) = (m.position(), m.size());
            landmarks::Monitor {
                id: m.name().cloned().unwrap_or_else(|| format!("display-{i}")),
                x: p.x,
                y: p.y,
                w: z.width,
                h: z.height,
                scale: m.scale_factor(),
            }
        })
        .collect()
}
fn save_layout(kv: &SqliteKv, l: &Layout) -> Result<(), String> {
    kv.set(
        "landmarks",
        &serde_json::to_string(l).map_err(|e| e.to_string())?,
    )
}
fn load_layout(app: &AppHandle, kv: &SqliteKv) -> Result<Layout, String> {
    let now = monitors(app);
    let mut l = match kv.get("landmarks")? {
        Some(s) => serde_json::from_str::<Layout>(&s)
            .map_err(|e| format!("Couldn't read Landmarks: {e}"))?,
        None => Layout {
            landmarks: now
                .iter()
                .flat_map(|m| landmarks::default_presets(&m.id))
                .collect(),
            monitors: now.clone(),
        },
    };
    l.reconcile(now);
    save_layout(kv, &l)?;
    Ok(l)
}
fn fit_tool(w: &tauri::WebviewWindow) {
    if let Ok(Some(m)) = w.current_monitor() {
        let a = m.work_area();
        let Ok(z) = w.outer_size() else { return };
        let Ok(p) = w.outer_position() else { return };
        let b = capture_bounds::fit(
            (a.position.x, a.position.y),
            (a.size.width, a.size.height),
            m.scale_factor(),
            (z.width, z.height),
            (p.x, p.y),
            false,
        );
        if (z.width, z.height) != b.size {
            let _ = w.set_size(tauri::PhysicalSize::new(b.size.0, b.size.1));
        }
        if (p.x, p.y) != b.position {
            let _ = w.set_position(tauri::PhysicalPosition::new(b.position.0, b.position.1));
        }
    }
}
fn position(w: &tauri::WebviewWindow, x: f64, y: f64) {
    if let Ok(Some(m)) = w.monitor_from_point(x, y) {
        let a = m.work_area();
        let scale = m.scale_factor();
        let _ = w.set_size(tauri::PhysicalSize::new(
            ((440.0 * scale) as u32).min(a.size.width),
            ((540.0 * scale) as u32).min(a.size.height),
        ));
        let z = w.outer_size().unwrap_or(tauri::PhysicalSize::new(440, 520));
        let maxx = a.position.x + (a.size.width.saturating_sub(z.width)) as i32;
        let maxy = a.position.y + (a.size.height.saturating_sub(z.height)) as i32;
        let px = (x as i32 + 18).clamp(a.position.x, maxx);
        let py = (y as i32 + 18).clamp(a.position.y, maxy);
        let _ = w.set_position(tauri::PhysicalPosition::new(px, py));
    }
}
pub fn open_tool(app: &AppHandle, tool: Tool, x: f64, y: f64, landmark: Option<String>) {
    if app.state::<AppState>().testing.load(Ordering::Relaxed) {
        let _ = app.emit(
            "pip://gesture-test",
            serde_json::json!({"tool":tool,"landmark":landmark}),
        );
        return;
    }
    if let Some(w) = app.get_webview_window("tool") {
        #[cfg(windows)]
        {
            use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
            let st = app.state::<AppState>();
            if let Ok(mut p) = st.previous.lock() {
                unsafe {
                    let h = GetForegroundWindow();
                    if w.hwnd().ok().map(|p| p.0 as isize) != Some(h.0 as isize) {
                        *p = h.0 as isize;
                    }
                }
            };
        }
        position(&w, x, y);
        let _ = app.emit_to(
            "tool",
            "pip://tool",
            serde_json::json!({"tool":tool,"landmark":landmark}),
        );
        let _ = w.show();
        if tool != Tool::FloatingReference {
            let _ = w.set_focus();
        }
    }
}
pub fn open_capture(app: &AppHandle) {
    let p = app
        .get_webview_window("main")
        .ok_or_else(|| tauri::Error::WindowNotFound)
        .and_then(|w| w.cursor_position())
        .unwrap_or(tauri::PhysicalPosition::new(200.0, 200.0));
    open_tool(app, Tool::QuickCapture, p.x, p.y, None);
}
#[tauri::command]
fn dismiss(w: tauri::WebviewWindow, st: State<AppState>) {
    let _ = w.hide();
    #[cfg(windows)]
    {
        use windows::Win32::{
            Foundation::HWND,
            UI::WindowsAndMessaging::{IsWindow, SetForegroundWindow},
        };
        if let Ok(p) = st.previous.lock() {
            unsafe {
                let hwnd = HWND(*p as *mut std::ffi::c_void);
                if IsWindow(hwnd).as_bool() {
                    let _ = SetForegroundWindow(hwnd);
                }
            }
        }
    }
    #[cfg(not(windows))]
    let _ = st;
}
#[tauri::command]
fn store_load(st: State<AppState>) -> Result<HashMap<String, String>, String> {
    Ok(st
        .kv
        .all()?
        .into_iter()
        .filter(|(k, _)| k.starts_with("pip."))
        .collect())
}
#[tauri::command]
fn store_set(st: State<AppState>, key: String, value: String) -> Result<(), String> {
    if !key.starts_with("pip.") {
        return Err("Invalid storage key".into());
    }
    st.kv.set(&key, &value)
}
#[tauri::command]
fn companion_read(st: State<AppState>) -> Result<Option<String>, String> {
    st.kv.get("pip.companion.v1")
}
#[tauri::command]
fn companion_write(
    app: AppHandle,
    st: State<AppState>,
    expected: Option<String>,
    value: String,
) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(&value).map_err(|e| e.to_string())?;
    if v["version"] != 1 || !v["items"].is_array() {
        return Err("Invalid content".into());
    }
    st.kv
        .compare_set("pip.companion.v1", expected.as_deref(), &value)?;
    let _ = app.emit("pip://content-changed", ());
    Ok(())
}
#[derive(serde::Serialize)]
struct LandmarkState {
    shortcut_errors: Vec<String>,
    sensitivity: u8,
    layout: Layout,
    status: String,
    paused: bool,
}
#[tauri::command]
fn overlay_get(st: State<AppState>) -> Result<Option<Layout>, String> {
    Ok(st.overlay_layout.lock().map_err(|e| e.to_string())?.clone())
}
#[tauri::command]
fn landmarks_get(st: State<AppState>) -> Result<LandmarkState, String> {
    Ok(LandmarkState {
        shortcut_errors: st
            .shortcut_errors
            .lock()
            .map_err(|e| e.to_string())?
            .clone(),
        sensitivity: st.level.load(Ordering::Relaxed),
        layout: st.engine.lock().map_err(|e| e.to_string())?.layout.clone(),
        status: st.gesture_status.lock().map_err(|e| e.to_string())?.clone(),
        paused: !st.shake.load(Ordering::Relaxed),
    })
}
#[tauri::command]
fn landmarks_save(
    st: State<AppState>,
    landmarks: Vec<Landmark>,
    reviewed: Vec<String>,
    expected: Option<Vec<Landmark>>,
) -> Result<Layout, String> {
    landmarks::validate(&landmarks).map_err(|e| e.to_string())?;
    let mut e = st.engine.lock().map_err(|e| e.to_string())?;
    if expected
        .as_ref()
        .is_some_and(|saved| saved != &e.layout.landmarks)
    {
        return Err(
            "Landmarks changed in another window or your displays changed. Reload before saving."
                .into(),
        );
    }
    let mut next = e.layout.clone();
    next.landmarks = landmarks;
    for l in &mut next.landmarks {
        if e.layout
            .landmarks
            .iter()
            .any(|old| old.id == l.id && old.needs_review)
            && !l.needs_review
            && !reviewed.contains(&l.id)
        {
            return Err(
                "Your displays changed while this editor was open. Reload Landmarks before saving."
                    .into(),
            );
        }
    }

    save_layout(&st.kv, &next)?;
    e.layout = next;
    e.reset();
    Ok(e.layout.clone())
}
#[tauri::command]
fn landmarks_reset(st: State<AppState>) -> Result<Layout, String> {
    let mut e = st.engine.lock().map_err(|e| e.to_string())?;
    let mut next = e.layout.clone();
    next.landmarks = next
        .monitors
        .iter()
        .flat_map(|m| landmarks::default_presets(&m.id))
        .collect();
    save_layout(&st.kv, &next)?;
    e.layout = next;
    e.reset();
    Ok(e.layout.clone())
}
#[tauri::command]
fn set_shake_enabled(st: State<AppState>, enabled: bool) -> Result<(), String> {
    st.kv
        .set("gesture-enabled", if enabled { "true" } else { "false" })?;
    st.shake.store(enabled, Ordering::Relaxed);
    st.engine.lock().map_err(|e| e.to_string())?.reset();
    Ok(())
}
#[tauri::command]
fn set_shake_level(st: State<AppState>, level: u8) -> Result<(), String> {
    let mut e = st.engine.lock().map_err(|e| e.to_string())?;
    let opts = GestureOpts::from_sensitivity(level);
    st.kv.set(
        "gesture-options",
        &serde_json::to_string(&opts).map_err(|e| e.to_string())?,
    )?;
    e.opts = opts;
    e.reset();
    st.kv.set("gesture-level", &level.to_string())?;
    st.level.store(level, Ordering::Relaxed);
    Ok(())
}
#[tauri::command]
fn gesture_config(
    st: State<AppState>,
    opts: Option<GestureOpts>,
    policy: Option<shake::Policy>,
) -> Result<serde_json::Value, String> {
    let mut e = st.engine.lock().map_err(|e| e.to_string())?;
    let mut p = st.policy.lock().map_err(|e| e.to_string())?;
    if let Some(o) = opts {
        if !o.min_travel.is_finite()
            || o.min_travel < 8.0
            || o.min_travel > 120.0
            || o.reversals < 3
            || o.reversals > 12
            || !o.window_ms.is_finite()
            || o.window_ms < 200.0
            || o.window_ms > 2000.0
            || !o.tolerance.is_finite()
            || o.tolerance < 0.0
            || o.tolerance > 100.0
            || !o.cooldown_ms.is_finite()
            || o.cooldown_ms < 300.0
            || o.cooldown_ms > 10000.0
            || !o.rest_ms.is_finite()
            || o.rest_ms < 200.0
            || o.rest_ms > 2000.0
        {
            return Err("Gesture thresholds are outside safe tuning bounds.".into());
        }
        st.kv.set(
            "gesture-options",
            &serde_json::to_string(&o).map_err(|e| e.to_string())?,
        )?;
        e.opts = o;
        e.reset();
    }
    if let Some(next) = policy {
        st.kv.set(
            "gesture-policy",
            &serde_json::to_string(&next).map_err(|e| e.to_string())?,
        )?;
        *p = next;
        e.reset();
    }
    Ok(serde_json::json!({"opts":e.opts,"policy":*p}))
}
#[tauri::command]
fn open_compact(app: AppHandle, tool: Tool) {
    let p = app
        .get_webview_window("main")
        .ok_or_else(|| tauri::Error::WindowNotFound)
        .and_then(|w| w.cursor_position())
        .unwrap_or(tauri::PhysicalPosition::new(200.0, 200.0));
    open_tool(&app, tool, p.x, p.y, None);
}
#[tauri::command]
fn open_settings(app: AppHandle) {
    show_main(&app);
    let _ = app.emit_to("main", "pip://settings", ());
}
#[tauri::command]
fn window_pin(w: tauri::WebviewWindow, pinned: bool) -> Result<(), String> {
    w.set_always_on_top(pinned).map_err(|e| e.to_string())
}
#[tauri::command]
fn preferences(app: AppHandle, startup: bool, notifications: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let result = if startup {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    result.map_err(|e| e.to_string())?;
    if notifications {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .request_permission()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn win_minimize(w: tauri::WebviewWindow) {
    let _ = w.minimize();
}
#[tauri::command]
fn win_toggle_max(w: tauri::WebviewWindow) -> bool {
    if w.is_maximized().unwrap_or(false) {
        let _ = w.unmaximize();
        false
    } else {
        let _ = w.maximize();
        true
    }
}
#[tauri::command]
fn win_is_max(w: tauri::WebviewWindow) -> bool {
    w.is_maximized().unwrap_or(false)
}
#[tauri::command]
fn win_close(w: tauri::WebviewWindow) {
    let _ = w.close();
}
#[tauri::command]
fn export_file(app: AppHandle, name: String, content: String) -> Result<Option<String>, String> {
    let Some(file) = app.dialog().file().set_file_name(name).blocking_save_file() else {
        return Ok(None);
    };
    let p = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&p, content).map_err(|e| e.to_string())?;
    Ok(Some(p.display().to_string()))
}
#[tauri::command]
fn import_file(app: AppHandle) -> Result<Option<String>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("Pip JSON", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let p = file.into_path().map_err(|e| e.to_string())?;
    if std::fs::metadata(&p).map_err(|e| e.to_string())?.len() > 50_000_000 {
        return Err("Import is too large (50 MB maximum).".into());
    }
    std::fs::read_to_string(p)
        .map(Some)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn backup(app: AppHandle, st: State<AppState>) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let p = dir.join(format!("pip-{t}.db"));
    st.kv.backup(&p)?;
    Ok(p.display().to_string())
}
#[derive(serde::Serialize, serde::Deserialize)]
struct Attachment {
    id: String,
    name: String,
    mode: String,
    path: String,
}
#[tauri::command]
fn attachment_pick(
    app: AppHandle,
    st: State<AppState>,
    mode: String,
) -> Result<Option<serde_json::Value>, String> {
    if mode != "copy" && mode != "shortcut" {
        return Err("Choose copy or shortcut.".into());
    }
    let Some(file) = app.dialog().file().blocking_pick_file() else {
        return Ok(None);
    };
    let original = file.into_path().map_err(|e| e.to_string())?;
    if !original.is_file() {
        return Err("Choose a file.".into());
    }
    if std::fs::metadata(&original)
        .map_err(|e| e.to_string())?
        .len()
        > 100_000_000
    {
        return Err("Files must be at most 100 MB.".into());
    }
    let name = original
        .file_name()
        .ok_or("Missing file name")?
        .to_string_lossy()
        .to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let path = if mode == "copy" {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("attachments");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let p = dir.join(format!("{id}-{}", name));
        std::fs::copy(&original, &p).map_err(|e| e.to_string())?;
        p
    } else {
        original
    };
    st.kv.set(
        &format!("attachment-{id}"),
        &serde_json::to_string(&Attachment {
            id: id.clone(),
            name: name.clone(),
            mode: mode.clone(),
            path: path.display().to_string(),
        })
        .map_err(|e| e.to_string())?,
    )?;
    Ok(Some(serde_json::json!({"id":id,"name":name,"mode":mode})))
}
#[tauri::command]
fn attachment_open(app: AppHandle, st: State<AppState>, id: String) -> Result<(), String> {
    let a: Attachment =
        serde_json::from_str(&st.kv.get(&format!("attachment-{id}"))?.ok_or(
            "This attachment is not on this PC. Exported shortcuts do not transfer files.",
        )?)
        .map_err(|e| e.to_string())?;
    let p = std::path::Path::new(&a.path);
    if !p.is_file() {
        return Err(
            "The original file is missing or moved. A shortcut does not keep a copy.".into(),
        );
    }
    let ext = p
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    if [
        "exe", "bat", "cmd", "ps1", "com", "msi", "vbs", "js", "scr", "lnk", "hta",
    ]
    .contains(&ext.as_str())
    {
        return Err(
            "Pip doesn't launch executable attachments. Open them yourself in File Explorer."
                .into(),
        );
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(a.path, None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn link_open(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http and https links can be opened.".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn floating_open(app: AppHandle, id: String) -> Result<(), String> {
    if uuid::Uuid::parse_str(&id).is_err() {
        return Err("Invalid item".into());
    }
    let label = format!("reference-{id}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(format!("index.html?reference={id}").into()),
    )
    .title("Pip reference")
    .inner_size(380.0, 420.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn landmarks_test(
    app: AppHandle,
    st: State<AppState>,
    landmarks: Option<Vec<Landmark>>,
) -> Result<(), String> {
    let mut e = st.engine.lock().map_err(|e| e.to_string())?;
    let mut saved = st.saved_layout.lock().map_err(|e| e.to_string())?;
    if let Some(items) = landmarks {
        landmarks::validate(&items).map_err(|e| e.to_string())?;
        if saved.is_none() {
            *saved = Some(e.layout.clone());
        }
        e.layout.landmarks = items;
        st.testing.store(true, Ordering::Relaxed);
    } else {
        if let Some(layout) = saved.take() {
            let mut layout = layout;
            layout.reconcile(monitors(&app));
            e.layout = layout;
        }
        st.testing.store(false, Ordering::Relaxed);
    }
    e.reset();
    Ok(())
}
#[tauri::command]
fn backup_restore(app: AppHandle, st: State<AppState>) -> Result<Option<String>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("SQLite backup", &["db"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    for (label, w) in app.webview_windows() {
        if label != "main" {
            let _ = w.hide();
        }
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    st.kv.backup(&dir.join(format!(
        "before-restore-{}.db",
        chrono::Utc::now().timestamp_millis()
    )))?;
    st.kv.restore(&path)?;
    clipboard::reload(&app)?;
    st.shake.store(
        st.kv.get("gesture-enabled")?.as_deref() != Some("false"),
        Ordering::Relaxed,
    );
    *st.policy.lock().map_err(|e| e.to_string())? = st
        .kv
        .get("gesture-policy")?
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    st.engine.lock().map_err(|e| e.to_string())?.opts = st
        .kv
        .get("gesture-options")?
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or(landmarks::DEFAULT_OPTS);
    st.level.store(
        st.kv
            .get("gesture-level")?
            .and_then(|s| s.parse().ok())
            .unwrap_or(50),
        Ordering::Relaxed,
    );
    let layout = load_layout(&app, &st.kv)?;
    {
        let mut e = st.engine.lock().map_err(|e| e.to_string())?;
        e.layout = layout;
        e.reset();
    }
    let _ = app.emit("pip://content-changed", ());
    Ok(Some(path.display().to_string()))
}
#[tauri::command]
fn overlays(app: AppHandle, enabled: bool, landmarks: Vec<Landmark>) -> Result<(), String> {
    landmarks_test(app.clone(), app.state::<AppState>(), None)?;
    for (label, w) in app.webview_windows() {
        if label.starts_with("overlay-") {
            let _ = w.destroy();
        }
    }
    if !enabled {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }
    landmarks::validate(&landmarks).map_err(|e| e.to_string())?;
    let now = monitors(&app);
    *app.state::<AppState>()
        .overlay_layout
        .lock()
        .map_err(|e| e.to_string())? = Some(Layout {
        monitors: now.clone(),
        landmarks,
    });
    for (i, m) in now.iter().enumerate() {
        let label = format!("overlay-{i}");
        let w = tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::App(
                format!("index.html?overlay={}", urlencoding::encode(&m.id)).into(),
            ),
        )
        .title("Pip Landmark setup")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
        w.set_position(tauri::PhysicalPosition::new(m.x, m.y))
            .map_err(|e| e.to_string())?;
        w.set_size(tauri::PhysicalSize::new(m.w, m.h))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn daily_backup(app: &AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!(
        "daily-{}.db",
        chrono::Local::now().format("%Y-%m-%d")
    ));
    if !path.exists() {
        app.state::<AppState>().kv.backup(&path)?;
    }
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("daily-") && n.ends_with(".db"))
        })
        .collect();
    files.sort();
    let count = files.len().saturating_sub(7);
    for p in files.into_iter().take(count) {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn background(app: AppHandle, running: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut tick = 0;
        let _ = daily_backup(&app);
        while running.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let st = app.state::<AppState>();
            let now = monitors(&app);
            if let Ok(mut e) = st.engine.lock() {
                if !now.is_empty() && e.layout.monitors != now {
                    e.reset();
                    e.layout.reconcile(now);
                    let _ = save_layout(&st.kv, &e.layout);
                    let _ = app.emit("pip://displays-changed", ());
                }
            }
            tick += 1;
            if tick % 15 != 0 {
                continue;
            }
            if let Ok(Some(raw)) = st.kv.get("pip.companion.v1") {
                if let Ok(s) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if s["prefs"]["notifications"] == true {
                        if let Some(items) = s["items"].as_array() {
                            for n in items {
                                if n["kind"] != "task" || n["done"] == true || n["deleted"] == true
                                {
                                    continue;
                                }
                                let Some(due) = n["due"]
                                    .as_str()
                                    .and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok())
                                else {
                                    continue;
                                };
                                let now = chrono::Utc::now();
                                let key = format!(
                                    "reminded-{}-{}",
                                    n["id"].as_str().unwrap_or(""),
                                    n["revision"]
                                );
                                if due.timestamp() <= now.timestamp()
                                    && st.kv.get(&key).ok().flatten().is_none()
                                {
                                    use tauri_plugin_notification::NotificationExt;
                                    let title = n["title"].as_str().unwrap_or("Follow-up");
                                    if app
                                        .notification()
                                        .builder()
                                        .title("Pip follow-up")
                                        .body(title)
                                        .show()
                                        .is_ok()
                                    {
                                        let _ = st.kv.set(&key, "1");
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if tick % 1800 == 0 {
                let _ = daily_backup(&app);
            }
        }
    });
}
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let kv = SqliteKv::open(dir.join("pip.db"))?;
            let old = FileKv::open(dir.join("store"))?;
            kv.migrate(&old)?;
            let layout = load_layout(app.handle(), &kv)?;
            let opts = kv
                .get("gesture-options")?
                .map(|s| serde_json::from_str(&s))
                .transpose()?
                .unwrap_or(landmarks::DEFAULT_OPTS);
            let policy = kv
                .get("gesture-policy")?
                .map(|s| serde_json::from_str(&s))
                .transpose()?
                .unwrap_or_default();
            let enabled = kv.get("gesture-enabled")?.as_deref() != Some("false");
            let shake = Arc::new(AtomicBool::new(enabled));
            let engine = Arc::new(Mutex::new(Engine::new(layout, opts)));
            let status = Arc::new(Mutex::new("starting".into()));
            let policy = Arc::new(Mutex::new(policy));
            let running = Arc::new(AtomicBool::new(true));
            let level = Arc::new(AtomicU8::new(
                kv.get("gesture-level")?
                    .and_then(|s| s.parse::<u8>().ok())
                    .unwrap_or(50)
                    .min(100),
            ));
            app.manage(AppState {
                kv,
                shake: shake.clone(),
                level: level.clone(),
                engine: engine.clone(),
                gesture_status: status.clone(),
                policy: policy.clone(),
                running: running.clone(),
                previous: Mutex::new(0),
                testing: AtomicBool::new(false),
                saved_layout: Mutex::new(None),
                overlay_layout: Mutex::new(None),
                shortcut_errors: Mutex::new(vec![]),
            });
            tauri::WebviewWindowBuilder::new(
                app,
                "tool",
                tauri::WebviewUrl::App("index.html?tool=quick-capture".into()),
            )
            .title("Pip quick tool")
            .inner_size(440.0, 540.0)
            .min_inner_size(360.0, 300.0)
            .resizable(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build()?;
            let cap = Shortcut::from_str("Ctrl+Shift+Space")?;
            if let Err(e) = app.global_shortcut().on_shortcut(cap, |app, _, ev| {
                if ev.state() == ShortcutState::Pressed {
                    open_capture(app)
                }
            }) {
                app.state::<AppState>()
                    .shortcut_errors
                    .lock()
                    .map_err(|e| e.to_string())?
                    .push(format!(
                        "Capture shortcut could not register: {e}. Use the tray instead."
                    ));
            }
            let favorites = Shortcut::from_str("Ctrl+Shift+P")?;
            let _ = app.global_shortcut().on_shortcut(favorites, |app, _, ev| {
                if ev.state() == ShortcutState::Pressed {
                    let p = app
                        .get_webview_window("main")
                        .ok_or_else(|| tauri::Error::WindowNotFound)
                        .and_then(|w| w.cursor_position())
                        .unwrap_or(tauri::PhysicalPosition::new(200.0, 200.0));
                    open_tool(app, Tool::Favorites, p.x, p.y, None)
                }
            });
            clipboard::start(app.handle().clone())?;
            shake::start(
                app.handle().clone(),
                shake,
                level,
                engine,
                status,
                policy,
                running.clone(),
            );
            background(app.handle().clone(), running);
            let open = MenuItem::with_id(app, "open", "Open Pip", true, None::<&str>)?;
            let cap = MenuItem::with_id(app, "capture", "Create a note", true, None::<&str>)?;
            let pause =
                MenuItem::with_id(app, "pause", "Pause / resume gestures", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Pip", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &cap, &pause, &settings, &quit])?;
            TrayIconBuilder::new()
                .icon(tauri::image::Image::new(
                    include_bytes!("../icons/tray32.rgba"),
                    32,
                    32,
                ))
                .tooltip("Pip — Need it later? Pip it.")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "open" => show_main(app),
                    "capture" => open_capture(app),
                    "pause" => {
                        let st = app.state::<AppState>();
                        let next = !st.shake.load(Ordering::Relaxed);
                        if st
                            .kv
                            .set("gesture-enabled", if next { "true" } else { "false" })
                            .is_ok()
                        {
                            st.shake.store(next, Ordering::Relaxed);
                            let _ = app.emit("pip://pause-changed", next);
                        }
                    }
                    "settings" => {
                        show_main(app);
                        let _ = app.emit_to("main", "pip://settings", ());
                    }
                    "quit" => {
                        app.state::<AppState>()
                            .running
                            .store(false, Ordering::Relaxed);
                        shake::stop();
                        clipboard::stop();
                        app.exit(0)
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = ev
                    {
                        show_main(tray.app_handle())
                    }
                })
                .build(app)?;
            if !std::env::args().any(|x| x == "--background") {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|w, ev| {
            if w.label() == "tool" && matches!(ev, WindowEvent::Moved(_) | WindowEvent::Resized(_))
            {
                if let Some(tool) = w.app_handle().get_webview_window("tool") {
                    fit_tool(&tool);
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = ev {
                if w.label() == "main" {
                    let st = w.app_handle().state::<AppState>();
                    let tray = st
                        .kv
                        .get("pip.companion.v1")
                        .ok()
                        .flatten()
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .is_none_or(|s| s["prefs"]["trayOnClose"] != false);
                    if tray {
                        api.prevent_close();
                        let _ = w.hide();
                    } else {
                        st.running.store(false, Ordering::Relaxed);
                        shake::stop();
                        clipboard::stop();
                        w.app_handle().exit(0);
                    }
                } else if w.label() == "tool" {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            companion_read,
            companion_write,
            store_load,
            store_set,
            landmarks_get,
            landmarks_save,
            landmarks_reset,
            set_shake_enabled,
            set_shake_level,
            gesture_config,
            open_compact,
            open_settings,
            dismiss,
            window_pin,
            preferences,
            win_minimize,
            win_toggle_max,
            win_is_max,
            win_close,
            export_file,
            import_file,
            backup,
            attachment_pick,
            attachment_open,
            link_open,
            floating_open,
            overlays,
            clipboard::clipboard_status,
            clipboard::clipboard_enable,
            clipboard::clipboard_delete,
            clipboard::clipboard_copy,
            clipboard::clipboard_config,
            clipboard::clipboard_text,
            backup_restore,
            landmarks_test,
            overlay_get
        ])
        .build(tauri::generate_context!())
        .expect("Pip could not start; existing data was preserved");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            app.state::<AppState>()
                .running
                .store(false, Ordering::Relaxed);
            shake::stop();
            clipboard::stop();
        }
    });
}
