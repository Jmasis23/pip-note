mod shake;

use pip_core::ai::{self, Endpoint, Msg};
use pip_core::{kv::FileKv, secrets};
use serde::Serialize;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const ENDPOINT_KEY: &str = "ai-endpoint"; // not a "pip." key, so the web view cannot read or write it

struct AppState { kv: FileKv, shake: Arc<AtomicBool>, shortcut: Mutex<Option<Shortcut>> }

/// Bring the window forward and tell the web view to open Capture. Used by the shake, the hotkey and the tray.
pub fn open_capture(app: &AppHandle) {
    show_main(app);
    let _ = app.emit("pip://capture", ());
}
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); }
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiStatus { configured: bool, base_url: String, model: String, has_key: bool }

fn endpoint(st: &AppState) -> Option<Endpoint> { st.kv.get(ENDPOINT_KEY).ok().flatten().and_then(|s| serde_json::from_str(&s).ok()) }

#[tauri::command]
fn ai_status(st: State<AppState>) -> AiStatus {
    let ep = endpoint(&st); let has_key = secrets::get().ok().flatten().map_or(false, |k| !k.is_empty());
    match ep {
        Some(e) => { let ok = ai::valid_base(&e.base_url) && !e.model.trim().is_empty() && (has_key || ai::is_local(&e.base_url)); AiStatus { configured: ok, base_url: e.base_url, model: e.model, has_key } }
        None => AiStatus { configured: false, base_url: String::new(), model: String::new(), has_key },
    }
}
#[tauri::command]
fn ai_configure(st: State<AppState>, base_url: String, model: String, key: Option<String>) -> Result<(), String> {
    if !ai::valid_base(&base_url) { return Err("The address must be https, or http for a local model.".into()); }
    if let Some(k) = key.as_deref().map(str::trim).filter(|k| !k.is_empty()) { secrets::set(k)?; }
    let ep = Endpoint { base_url: ai::normalize_base(&base_url), model: model.trim().to_string() };
    st.kv.set(ENDPOINT_KEY, &serde_json::to_string(&ep).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
#[tauri::command]
fn ai_clear(st: State<AppState>) -> Result<(), String> { secrets::delete()?; st.kv.remove(ENDPOINT_KEY).map_err(|e| e.to_string()) }

/// Test an endpoint without saving it. Uses the stored key when none is typed.
#[tauri::command]
async fn ai_test(base_url: String, model: String, key: Option<String>) -> Result<(), String> {
    let key = match key.filter(|k| !k.trim().is_empty()) { Some(k) => Some(k), None => secrets::get().ok().flatten() };
    let msgs = [Msg { role: "user".into(), content: "Reply with the word ok.".into() }];
    ai::complete(&Endpoint { base_url, model }, key.as_deref(), &msgs, 5, 20_000).await.map(|_| ())
}
/// Always uses the saved endpoint and key. The web view cannot point it elsewhere.
#[tauri::command]
async fn ai_complete(st: State<'_, AppState>, messages: Vec<Msg>, max_tokens: Option<u32>, timeout_ms: Option<u64>) -> Result<String, String> {
    let ep = endpoint(&st).ok_or("AI isn't set up.")?;
    let key = secrets::get().ok().flatten();
    ai::complete(&ep, key.as_deref(), &messages, max_tokens.unwrap_or(800).min(4000), timeout_ms.unwrap_or(45_000).min(120_000)).await
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
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let kv = FileKv::open(dir.join("store")).map_err(|e| e.to_string())?;
            let shake = Arc::new(AtomicBool::new(true));
            let st = AppState { kv, shake: shake.clone(), shortcut: Mutex::new(None) };
            let handle = app.handle().clone();
            let _ = register_shortcut(&handle, &st, parse_shortcut("Ctrl+Shift+Space")?); // default until the web view says otherwise
            app.manage(st);
            shake::start(handle.clone(), shake);

            let open = MenuItem::with_id(app, "open", "Open Pip", true, None::<&str>)?;
            let cap = MenuItem::with_id(app, "capture", "Capture a thought", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &cap, &quit])?;
            let mut tray = TrayIconBuilder::new().tooltip("Pip").menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() { "open" => show_main(app), "capture" => open_capture(app), "quit" => app.exit(0), _ => {} })
                .on_tray_icon_event(|tray, ev| { if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev { show_main(tray.app_handle()); } });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.build(app)?;
            Ok(())
        })
        // Closing the window keeps Pip in the tray so the shake and hotkey still work.
        .on_window_event(|w, ev| { if let WindowEvent::CloseRequested { api, .. } = ev { api.prevent_close(); let _ = w.hide(); } })
        .invoke_handler(tauri::generate_handler![store_load, store_set, ai_status, ai_configure, ai_clear, ai_test, ai_complete, set_shake_enabled, set_shortcut, export_file])
        .run(tauri::generate_context!())
        .expect("error while running Pip");
}
