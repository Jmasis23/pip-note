//! AI for Pip: one chat call (NVIDIA NIM first, Gemini as the fallback) and a reminder clock.
//! Keys live in Windows Credential Manager. The web view can ask "is a key set?" but can never read one.
use crate::AppState;
use pip_core::ai::{self, Endpoint, Msg};
use pip_core::secrets;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

const CFG_KEY: &str = "ai-config"; // not a "pip." key, so the web view cannot read it
const FIRED_KEY: &str = "reminders-fired";

struct Provider { id: &'static str, base: &'static str, models: &'static [&'static str] }
const PROVIDERS: [Provider; 2] = [
    Provider { id: "nvidia", base: "https://integrate.api.nvidia.com/v1", models: &["openai/gpt-oss-20b", "nvidia/nemotron-3-super-120b-a12b"] },
    Provider { id: "gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", models: &["gemini-2.5-flash"] },
];
fn provider(id: &str) -> Option<&'static Provider> { PROVIDERS.iter().find(|p| p.id == id) }
fn account(id: &str) -> String { format!("ai-{id}") }

#[derive(Serialize, Deserialize, Default)]
struct Cfg { primary: Option<String> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status { primary: Option<String>, nvidia: bool, gemini: bool }

fn cfg(st: &AppState) -> Cfg { st.kv.get(CFG_KEY).ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default() }
fn status_of(st: &AppState) -> Status {
    let has = |id: &str| secrets::get(&account(id)).ok().flatten().map_or(false, |k| !k.is_empty());
    let (n, g) = (has("nvidia"), has("gemini"));
    let want = cfg(st).primary.filter(|p| provider(p).is_some());
    let primary = match want { Some(p) if (p == "nvidia" && n) || (p == "gemini" && g) => Some(p), _ => if n { Some("nvidia".into()) } else if g { Some("gemini".into()) } else { None } };
    Status { primary, nvidia: n, gemini: g }
}

#[tauri::command]
pub(crate) fn ai_status(st: State<AppState>) -> Status { status_of(&st) }

/// Save (or replace) a provider key. An empty key removes it.
#[tauri::command]
pub(crate) fn ai_set_key(st: State<AppState>, provider_id: String, key: String) -> Result<Status, String> {
    if provider(&provider_id).is_none() { return Err("Unknown provider.".into()); }
    let key = key.trim();
    if key.is_empty() { secrets::delete(&account(&provider_id))?; } else {
        if key.len() < 16 || key.len() > 400 || key.chars().any(|c| c.is_whitespace() || c.is_control()) { return Err("That doesn't look like a key.".into()); }
        secrets::set(&account(&provider_id), key)?;
    }
    Ok(status_of(&st))
}

#[tauri::command]
pub(crate) fn ai_set_primary(st: State<AppState>, provider_id: String) -> Result<Status, String> {
    if provider(&provider_id).is_none() { return Err("Unknown provider.".into()); }
    st.kv.set(CFG_KEY, &serde_json::to_string(&Cfg { primary: Some(provider_id) }).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(status_of(&st))
}

/// Run a chat. Tries the primary provider, then the other one if it has a key and the first failed.
#[tauri::command]
pub(crate) async fn ai_complete(st: State<'_, AppState>, messages: Vec<Msg>, max_tokens: Option<u32>) -> Result<String, String> {
    if messages.is_empty() || messages.len() > 12 || messages.iter().map(|m| m.content.len()).sum::<usize>() > 60_000 { return Err("That's too long for Pip to read in one go.".into()); }
    let s = status_of(&st);
    let Some(first) = s.primary.clone() else { return Err("Add an AI key in Settings first.".into()) };
    let order: Vec<&str> = if first == "nvidia" { vec!["nvidia", "gemini"] } else { vec!["gemini", "nvidia"] };
    let mut last = String::from("No AI provider is ready.");
    for id in order {
        if !((id == "nvidia" && s.nvidia) || (id == "gemini" && s.gemini)) { continue; }
        let Some(p) = provider(id) else { continue };
        let Ok(Some(key)) = secrets::get(&account(id)) else { continue };
        for model in p.models {
            let ep = Endpoint { base_url: p.base.to_string(), model: model.to_string() };
            match ai::complete(&ep, Some(&key), &messages, max_tokens.unwrap_or(2500).min(4000), 45_000).await { Ok(t) => return Ok(t), Err(e) => last = e }
        }
    }
    Err(last)
}

#[derive(Deserialize)]
struct Due { id: String, at: f64, #[serde(default)] text: String }

/// Reminders are a list the web view keeps under "pip.reminders". Pip checks it every 20 seconds, even when the window is closed.
pub(crate) fn start_clock(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tick(&app);
            let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(std::time::Duration::from_secs(20))).await;
        }
    });
}
fn tick(app: &AppHandle) {
    let st = app.state::<AppState>();
    let list: Vec<Due> = st.kv.get("pip.reminders").ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let mut fired: Vec<String> = st.kv.get(FIRED_KEY).ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    let before = fired.len();
    let due: Vec<&Due> = list.iter().filter(|r| r.at <= now && !fired.contains(&r.id)).collect();
    for r in due {
        let body: String = r.text.chars().take(160).collect();
        let _ = app.notification().builder().title("Pip").body(if body.is_empty() { "Reminder".to_string() } else { body }).show();
        let _ = app.emit("reminder-fired", r.id.clone());
        fired.push(r.id.clone());
    }
    fired.retain(|id| list.iter().any(|r| &r.id == id)); // forget reminders the user deleted
    if fired.len() != before || fired.len() > 200 { let _ = st.kv.set(FIRED_KEY, &serde_json::to_string(&fired).unwrap_or_else(|_| "[]".into())); }
}
