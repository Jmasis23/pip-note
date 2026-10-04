mod shake;
mod capture_bounds;
mod clipboard;

use pip_core::chatgpt::{self, Cred};
use pip_core::kv::FileKv;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};


struct AppState { kv: FileKv, shake: Arc<AtomicBool>, level: Arc<std::sync::atomic::AtomicU8>, shortcut: Mutex<Option<Shortcut>> }

/// Keep capture on the active monitor, above its taskbar and inside its work area.
/// Tauri sizes here are physical pixels; UI limits are converted using that monitor's DPI.
static CAPTURE_LIMITS: Mutex<Option<(u32, u32, u32, u32)>> = Mutex::new(None);

fn fit_capture(w: &tauri::WebviewWindow, opening: bool) {
    let monitor = if opening {
        w.cursor_position().ok().and_then(|p| w.monitor_from_point(p.x, p.y).ok().flatten())
    } else { w.current_monitor().ok().flatten() }
        .or_else(|| w.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return; };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let size = w.inner_size().unwrap_or(tauri::PhysicalSize::new((600.0 * scale) as u32, (330.0 * scale) as u32));
    let pos = w.outer_position().unwrap_or(area.position);
    let bounds = capture_bounds::fit((area.position.x, area.position.y), (area.size.width, area.size.height), scale, (size.width, size.height), (pos.x, pos.y), opening);
    let (min_w, min_h) = bounds.min; let (max_w, max_h) = bounds.max;
    let next = tauri::PhysicalSize::new(bounds.size.0, bounds.size.1);
    // Only update constraints when the work area / DPI changes. Reapplying them on
    // every Resized event can create a stream of redundant native resize events.
    if let Ok(mut limits) = CAPTURE_LIMITS.lock() {
        let next_limits = (min_w, min_h, max_w, max_h);
        if *limits != Some(next_limits) {
            let _ = w.set_min_size(None::<tauri::PhysicalSize<u32>>);
            let _ = w.set_max_size(Some(tauri::PhysicalSize::new(max_w, max_h)));
            let _ = w.set_min_size(Some(tauri::PhysicalSize::new(min_w, min_h)));
            *limits = Some(next_limits);
        }
    }
    if size != next { let _ = w.set_size(next); }
    let next_pos = tauri::PhysicalPosition::new(bounds.position.0, bounds.position.1);
    if pos != next_pos { let _ = w.set_position(next_pos); }
}

/// Bring the window forward and tell the web view to open Capture. Used by the shake, the hotkey and the tray.
pub fn open_capture(app: &AppHandle) {
    // Only the small capture box comes up. The main window stays where it is (hidden in the tray or behind other apps).
    if let Some(w) = app.get_webview_window("capture") {
        fit_capture(&w, true); let _ = w.show(); let _ = w.set_focus();
        let _ = app.emit_to("capture", "pip://capture-show", ());
    }
}
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); return; }
    // The main window's web view is released while Pip sits in the tray (see the close handler). Build it again with the same settings.
    // Built off the event-loop thread so it cannot deadlock on Windows.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if app.get_webview_window("main").is_some() { return; }
        if let Ok(w) = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("Pip").inner_size(1180.0, 780.0).min_inner_size(420.0, 520.0).resizable(true).decorations(false).build()
        { let _ = w.set_focus(); }
    });
}

fn web_key_ok(k: &str) -> bool { k.starts_with("pip.") && !k.starts_with("pip.ai") }

#[tauri::command]
fn store_load(st: State<AppState>) -> Result<HashMap<String, String>, String> {
    Ok(st.kv.all().map_err(|e| e.to_string())?.into_iter().filter(|(k, _)| web_key_ok(k)).collect())
}
#[tauri::command]
fn store_set(st: State<AppState>, key: String, value: String) -> Result<(), String> {
    if !web_key_ok(&key) { return Err("bad key".into()); }
    st.kv.set(&key, &value).map_err(|e| e.to_string())
}

const CRED_KEY: &str = "chatgpt-cred"; // none of these are "pip." keys, so the web view cannot read them
const HOST_KEY: &str = "chatgpt-host";
fn cred(st: &AppState) -> Option<Cred> { st.kv.get(CRED_KEY).ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).filter(|c: &Cred| c.has_plan()) }
fn save_cred(st: &AppState, c: &Cred) -> Result<(), String> { st.kv.set(CRED_KEY, &serde_json::to_string(c).map_err(|e| e.to_string())?).map_err(|e| e.to_string()) }
fn open_url(url: &str) -> Result<(), String> {
    #[cfg(windows)] let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(not(windows))] let r = std::process::Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ()).map_err(|_| "Couldn't open your browser.".to_string())
}

/// Opens the browser, waits for the loopback callback, and saves the account. Returns the email.
#[tauri::command]
async fn chatgpt_sign_in(st: State<'_, AppState>) -> Result<String, String> {
    let host = match st.kv.get(HOST_KEY).ok().flatten() { Some(h) if h.starts_with("urn:uuid:") => h, _ => { let h = chatgpt::new_host_id(); st.kv.set(HOST_KEY, &h).map_err(|e| e.to_string())?; h } };
    let prev = cred(&st);
    let listener = match chatgpt::bind_loopback(1455).await { Some(l) => l, None => chatgpt::bind_loopback(0).await.ok_or("Couldn't start the sign-in listener.")? };
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let a = chatgpt::Attempt::new();
    let url = chatgpt::authorize_url(prev.as_ref().map(|p| p.client_id.as_str()), &host, port, &a, prev.as_ref().map(|p| p.email.as_str()));
    open_url(&url)?;
    let cb = chatgpt::wait_for_callback(listener, &a.state, std::time::Duration::from_secs(300)).await?;
    let client_id = match (&cb.client_id, &prev) { (Some(c), _) => c.clone(), (None, Some(p)) => p.client_id.clone(), (None, None) => return Err("ChatGPT didn't finish setting Pip up. Try again.".into()) };
    let t = chatgpt::exchange_code(&client_id, &cb.code, &a.verifier, port).await?;
    let mut c = chatgpt::cred_from(t, &client_id, &host, Some(&a.nonce), None, chatgpt::now())?;
    if let Some(p) = prev { if p.subject == c.subject { c.model = p.model; } }
    save_cred(&st, &c)?;
    Ok(c.email)
}

/// The ChatGPT ID token saved by the last sign-in. Pip's own account sign-in sends it to our server to be verified.
#[tauri::command]
fn chatgpt_id_token(st: State<AppState>) -> Result<String, String> { cred(&st).map(|c| c.id_token).filter(|t| !t.is_empty()).ok_or("Sign in with ChatGPT first.".to_string()) }

/// Opens an account sign-in page in the browser and waits for it to come back to a loopback address. `{PORT}` in the URL is replaced by the listener's port. Returns the one-time code.
#[tauri::command]
async fn oauth_browser(url_template: String, state: String) -> Result<String, String> {
    if !url_template.starts_with("https://ovkfjiciwuhcqqpmdgaa.supabase.co/") { return Err("Unexpected sign-in address.".into()); }
    let listener = match chatgpt::bind_loopback(0).await { Some(l) => l, None => return Err("Couldn't start the sign-in listener.".into()) };
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    open_url(&url_template.replace("%7BPORT%7D", &port.to_string()).replace("{PORT}", &port.to_string()))?;
    let cb = chatgpt::wait_for_callback(listener, &state, std::time::Duration::from_secs(300)).await?;
    Ok(cb.code)
}

async fn tokio_sleep(ms: u64) { let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_millis(ms))).await; }

#[tauri::command]
fn capture_hide(app: AppHandle) { if let Some(w) = app.get_webview_window("capture") { let _ = w.hide(); } }
#[tauri::command]
fn capture_saved(app: AppHandle) {
    if let Some(w) = app.get_webview_window("capture") { let _ = w.hide(); }
    let _ = app.emit_to("main", "pip://notes-changed", ());
}
/// The capture box changed a preference. Tell the main window to reload.
#[tauri::command]
fn prefs_changed(app: AppHandle) { let _ = app.emit_to("main", "pip://notes-changed", ()); }
#[tauri::command]
fn win_minimize(w: tauri::WebviewWindow) { let _ = w.minimize(); }
#[tauri::command]
fn win_toggle_max(w: tauri::WebviewWindow) -> bool {
    if w.is_maximized().unwrap_or(false) { let _ = w.unmaximize(); false } else { let _ = w.maximize(); true }
}
#[tauri::command]
fn win_is_max(w: tauri::WebviewWindow) -> bool { w.is_maximized().unwrap_or(false) }
#[tauri::command]
fn win_close(w: tauri::WebviewWindow) { let _ = w.hide(); }
/// An update that finished downloading and waits for the user to restart.
struct Pending(Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>);

#[tauri::command]
async fn update_check(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let u = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(u.map(|u| u.version))
}
#[tauri::command]
async fn update_download(app: AppHandle, pending: State<'_, Pending>) -> Result<String, String> {
    use tauri_plugin_updater::UpdaterExt;
    let u = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?.ok_or("You're up to date")?;
    let bytes = u.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    let v = u.version.clone();
    *pending.0.lock().map_err(|_| "busy".to_string())? = Some((u, bytes));
    Ok(v)
}
#[tauri::command]
fn update_install(app: AppHandle, pending: State<'_, Pending>) -> Result<(), String> {
    let (u, bytes) = pending.0.lock().map_err(|_| "busy".to_string())?.take().ok_or("Nothing downloaded yet")?;
    u.install(bytes).map_err(|e| e.to_string())?;
    app.restart()
}
#[tauri::command]
fn set_shake_level(st: State<AppState>, level: u8) {
    st.level.store(level.min(100), Ordering::Relaxed);
}
#[tauri::command]
fn set_shake_enabled(st: State<AppState>, enabled: bool) { st.shake.store(enabled, Ordering::Relaxed); }

fn parse_shortcut(s: &str) -> Result<Shortcut, String> {
    let mapped = s.split('+').map(|p| match p.trim().to_ascii_lowercase().as_str() { "win" | "windows" | "meta" => "Super".to_string(), _ => p.trim().to_string() }).collect::<Vec<_>>().join("+");
    Shortcut::from_str(&mapped).map_err(|e| format!("{e}"))
}
fn register_shortcut(app: &AppHandle, st: &AppState, sc: Shortcut) -> Result<(), String> {
    let mut cur = st.shortcut.lock().map_err(|_| "lock".to_string())?;
    if let Some(old) = cur.take() { let _ = app.global_shortcut().unregister(old); }
    app.global_shortcut().on_shortcut(sc, |app, _s, ev| { if ev.state() == ShortcutState::Pressed { open_capture(app); } }).map_err(|e| e.to_string())?;
    *cur = Some(sc); Ok(())
}
#[tauri::command]
fn set_shortcut(app: AppHandle, st: State<AppState>, shortcut: String) -> Result<(), String> {
    let sc = parse_shortcut(&shortcut)?;
    if st.shortcut.lock().map_err(|_| "lock".to_string())?.as_ref() == Some(&sc) { return Ok(()); }
    register_shortcut(&app, &st, sc)
}

/// Write an export into the user's Downloads folder. Returns the full path.
#[tauri::command]
fn export_file(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '-' }).collect();
    if safe.is_empty() || safe.starts_with('.') { return Err("bad file name".into()); }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let mut path = dir.join(&safe); let mut n = 1;
    while path.exists() { let (stem, ext) = safe.rsplit_once('.').unwrap_or((&safe, "")); path = dir.join(if ext.is_empty() { format!("{stem}-{n}") } else { format!("{stem}-{n}.{ext}") }); n += 1; }
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Pending(Mutex::new(None)))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let kv = FileKv::open(dir.join("store")).map_err(|e| e.to_string())?;
            let shake = Arc::new(AtomicBool::new(true));
            let level = Arc::new(std::sync::atomic::AtomicU8::new(50));
            let st = AppState { kv, shake: shake.clone(), level: level.clone(), shortcut: Mutex::new(None) };
            let handle = app.handle().clone();
            let _ = register_shortcut(&handle, &st, parse_shortcut("Ctrl+Shift+Space")?); // default until the web view says otherwise
            app.manage(st);
            clipboard::start(handle.clone())?;
            shake::start(handle.clone(), shake, level);

            // The capture box: a small always-on-top window that stays hidden until the shake, hotkey or tray asks for it.
            tauri::WebviewWindowBuilder::new(app, "capture", tauri::WebviewUrl::App("index.html?capture=1".into()))
                .title("Pip capture").inner_size(600.0, 330.0).min_inner_size(360.0, 280.0).max_inner_size(1000.0, 800.0).decorations(false).resizable(true).always_on_top(true).skip_taskbar(true).visible(false).center().build()?;

            let open = MenuItem::with_id(app, "open", "Open Pip", true, None::<&str>)?;
            let cap = MenuItem::with_id(app, "capture", "Capture a thought", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &cap, &quit])?;
            let mut tray = TrayIconBuilder::new().tooltip("Pip").menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() { "open" => show_main(app), "capture" => open_capture(app), "quit" => app.exit(0), _ => {} })
                .on_tray_icon_event(|tray, ev| { if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev { show_main(tray.app_handle()); } });
            // Tray: the bare orange spark (32x32 RGBA, no tile) so it reads on light and dark taskbars. Falls back to the app icon.
            let spark = tauri::image::Image::new(include_bytes!("../icons/tray32.rgba"), 32, 32);
            tray = tray.icon(spark);
            tray.build(app)?;
            Ok(())
        })
        // Closing the window keeps Pip in the tray so the shake and hotkey still work.
        // The main window's web view (the biggest memory cost) is released a few seconds later, after any pending note save has flushed,
        // and rebuilt on demand by show_main. The small capture box stays loaded so the shake still opens it instantly.
        .on_window_event(|w, ev| {
            if w.label() == "capture" && matches!(ev, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
                if let Some(capture) = w.app_handle().get_webview_window("capture") { fit_capture(&capture, false); }
            }
            if let WindowEvent::CloseRequested { api, .. } = ev {
                api.prevent_close();
                let _ = w.hide();
                if w.label() == "main" {
                    let w = w.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio_sleep(3000).await;
                        if !w.is_visible().unwrap_or(true) { let _ = w.destroy(); }
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![clipboard::clipboard_status, clipboard::clipboard_enable, clipboard::clipboard_delete, clipboard::clipboard_copy, store_load, store_set, chatgpt_sign_in, chatgpt_id_token, oauth_browser, set_shake_enabled, set_shake_level, update_check, update_download, update_install, set_shortcut, export_file, win_minimize, win_toggle_max, win_is_max, win_close, capture_hide, capture_saved, prefs_changed])
        .run(tauri::generate_context!())
        .expect("error while running Pip");
}
