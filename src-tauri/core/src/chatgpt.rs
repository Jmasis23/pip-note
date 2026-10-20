//! "Sign in with ChatGPT" (plan usage) for a locally hosted app: PKCE loopback sign-in, token refresh and Responses API calls.
//! Docs: https://developers.openai.com/siwc/token-sharing-open-source
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;

pub const AUTH_URL: &str = "https://auth.openai.com/api/accounts/authorize";
pub const TOKEN_URL: &str = "https://auth.openai.com/api/accounts/oauth/token";
pub const API_BASE: &str = "https://api.openai.com/v1";
pub const ISSUER: &str = "https://auth.openai.com";
pub const AGENT_NAME: &str = "Pip";
pub const SCOPE: &str = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
pub const PLAN_SCOPE: &str = "chatgpt.tokens.use.direct";
pub const CALLBACK_PATH: &str = "/auth/callback";

/// What we keep on disk for one signed-in account.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Cred {
    pub client_id: String, pub host_id: String, pub email: String, pub subject: String,
    pub id_token: String, pub access_token: String, pub refresh_token: String,
    pub expires_at: u64, pub scopes: Vec<String>, pub model: String,
}
impl Cred { pub fn has_plan(&self) -> bool { self.scopes.iter().any(|s| s == PLAN_SCOPE) } }

pub fn now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

pub fn random_bytes<const N: usize>() -> [u8; N] { let mut b = [0u8; N]; getrandom::getrandom(&mut b).expect("system randomness"); b }
pub fn random_token() -> String { B64.encode(random_bytes::<32>()) }
pub fn challenge_for(verifier: &str) -> String { B64.encode(Sha256::digest(verifier.as_bytes())) }

/// Stable per-installation id, as a UUIDv4 URN. Generate once and keep.
pub fn new_host_id() -> String {
    let mut b = random_bytes::<16>(); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    let h: String = b.iter().map(|x| format!("{x:02x}")).collect();
    format!("urn:uuid:{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

pub struct Attempt { pub state: String, pub nonce: String, pub verifier: String }
impl Attempt { pub fn new() -> Self { Self { state: random_token(), nonce: random_token(), verifier: random_token() } } }

pub fn redirect_uri(port: u16) -> String { format!("http://127.0.0.1:{port}{CALLBACK_PATH}") }

/// First sign-in uses `dynamic_agent_client` plus the agent name. Later sign-ins use the issued client id.
pub fn authorize_url(client_id: Option<&str>, host_id: &str, port: u16, a: &Attempt, login_hint: Option<&str>) -> String {
    let mut u = url::Url::parse(AUTH_URL).expect("static url");
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("client_id", client_id.unwrap_or("dynamic_agent_client"));
        if client_id.is_none() { q.append_pair("agent_name_hint", AGENT_NAME); }
        q.append_pair("ext_agent_host_id", host_id);
        if let Some(h) = login_hint.filter(|h| !h.is_empty()) { q.append_pair("login_hint", h); }
        q.append_pair("response_type", "code").append_pair("redirect_uri", &redirect_uri(port)).append_pair("scope", SCOPE)
            .append_pair("resource", API_BASE).append_pair("state", &a.state).append_pair("nonce", &a.nonce)
            .append_pair("code_challenge_method", "S256").append_pair("code_challenge", &challenge_for(&a.verifier));
    }
    u.to_string()
}

#[derive(Debug, PartialEq)]
pub struct Callback { pub code: String, pub client_id: Option<String> }

/// Parse the first line of the browser's request to the loopback listener, e.g. `GET /auth/callback?code=..&state=.. HTTP/1.1`.
pub fn parse_callback(request_line: &str, expected_state: &str) -> Result<Callback, String> {
    let target = request_line.split_whitespace().nth(1).ok_or("Unreadable sign-in response.")?;
    let u = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| "Unreadable sign-in response.".to_string())?;
    if u.path() != CALLBACK_PATH { return Err("not the callback".into()); }
    let get = |k: &str| u.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.to_string());
    if get("state").as_deref() != Some(expected_state) { return Err("Sign-in didn't match this attempt. Try again.".into()); }
    if let Some(e) = get("error") { return Err(if e == "access_denied" { "Sign-in was cancelled.".into() } else { format!("ChatGPT sign-in failed ({e}).") }); }
    let code = get("code").filter(|c| !c.is_empty()).ok_or("ChatGPT didn't send a sign-in code.")?;
    Ok(Callback { code, client_id: get("client_id").filter(|c| !c.is_empty()) })
}

/// Listen on 127.0.0.1 only (port 0 picks a free one).
pub async fn bind_loopback(port: u16) -> Option<tokio::net::TcpListener> { tokio::net::TcpListener::bind(("127.0.0.1", port)).await.ok() }

/// Wait for the browser to come back to the loopback listener.
pub async fn wait_for_callback(l: tokio::net::TcpListener, expected_state: &str, wait: Duration) -> Result<Callback, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let deadline = tokio::time::Instant::now() + wait;
    loop {
        let (mut s, _) = tokio::time::timeout_at(deadline, l.accept()).await.map_err(|_| "Sign-in timed out. Try again.".to_string())?.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8192]; let n = tokio::time::timeout(Duration::from_secs(5), s.read(&mut buf)).await.ok().and_then(|r| r.ok()).unwrap_or(0);
        let head = String::from_utf8_lossy(&buf[..n]).to_string(); let line = head.lines().next().unwrap_or("").to_string();
        let res = parse_callback(&line, expected_state);
        let (status, msg) = match &res { Ok(_) => ("200 OK", "You're signed in. You can close this tab and go back to Pip."), Err(e) if e == "not the callback" => ("404 Not Found", "Not found."), Err(_) => ("400 Bad Request", "Sign-in didn't complete. Go back to Pip and try again.") };
        let html = format!("<!doctype html><meta charset=utf-8><title>Pip</title><body style=\"font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#1b1c26\"><p>{msg}</p>");
        let _ = s.write_all(format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len()).as_bytes()).await; let _ = s.shutdown().await;
        match res { Err(e) if e == "not the callback" => continue, other => return other }
    }
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse { pub access_token: String, #[serde(default)] pub refresh_token: Option<String>, #[serde(default)] pub id_token: Option<String>, #[serde(default)] pub expires_in: Option<u64>, #[serde(default)] pub scope: Option<String> }

#[derive(Debug, PartialEq)]
pub struct Claims { pub sub: String, pub email: String }

/// Check iss, aud, exp and nonce on the ID token. The token came straight from the token endpoint over TLS; its signature is not checked here.
pub fn check_id_token(id_token: &str, client_id: &str, nonce: Option<&str>, at: u64) -> Result<Claims, String> {
    let bad = || "ChatGPT sent an ID token Pip couldn't verify.".to_string();
    let payload = id_token.split('.').nth(1).ok_or_else(bad)?;
    let v: serde_json::Value = serde_json::from_slice(&B64.decode(payload.trim_end_matches('=')).map_err(|_| bad())?).map_err(|_| bad())?;
    if v["iss"].as_str() != Some(ISSUER) { return Err(bad()); }
    let aud_ok = match &v["aud"] { serde_json::Value::String(s) => s == client_id, serde_json::Value::Array(a) => a.iter().any(|x| x.as_str() == Some(client_id)), _ => false };
    if !aud_ok { return Err(bad()); }
    if v["exp"].as_u64().map_or(true, |e| e + 60 < at) { return Err(bad()); }
    if let Some(n) = nonce { if v["nonce"].as_str() != Some(n) { return Err(bad()); } }
    Ok(Claims { sub: v["sub"].as_str().ok_or_else(bad)?.to_string(), email: v["email"].as_str().unwrap_or("").to_string() })
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(30)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e| e.to_string())
}

async fn token_post(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let res = client()?.post(TOKEN_URL).form(form).send().await.map_err(|_| "Couldn't reach ChatGPT sign-in.".to_string())?;
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        let body = res.text().await.unwrap_or_default();
        let grant = serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|v| v["error"].as_str().map(str::to_string));
        return Err(if grant.as_deref() == Some("invalid_grant") { "Your ChatGPT sign-in expired. Sign in again.".into() } else { format!("ChatGPT sign-in failed ({status}).") });
    }
    res.json().await.map_err(|_| "ChatGPT sent something unreadable.".to_string())
}

pub async fn exchange_code(client_id: &str, code: &str, verifier: &str, port: u16) -> Result<TokenResponse, String> {
    token_post(&[("grant_type", "authorization_code"), ("client_id", client_id), ("code", code), ("code_verifier", verifier), ("redirect_uri", &redirect_uri(port)), ("resource", API_BASE)]).await
}
pub async fn refresh(client_id: &str, refresh_token: &str) -> Result<TokenResponse, String> {
    token_post(&[("grant_type", "refresh_token"), ("client_id", client_id), ("refresh_token", refresh_token), ("resource", API_BASE)]).await
}

/// Build the saved record from a token response. Fails when plan usage was not granted.
pub fn cred_from(t: TokenResponse, client_id: &str, host_id: &str, nonce: Option<&str>, prev: Option<&Cred>, at: u64) -> Result<Cred, String> {
    let id_token = t.id_token.clone().or_else(|| prev.map(|p| p.id_token.clone())).ok_or("ChatGPT sent no ID token.")?;
    let claims = check_id_token(&id_token, client_id, if t.id_token.is_some() { nonce } else { None }, at)?;
    if let Some(p) = prev { if p.subject != claims.sub { return Err("That's a different ChatGPT account. Sign out first.".into()); } }
    let scopes: Vec<String> = match &t.scope { Some(s) => s.split_whitespace().map(str::to_string).collect(), None => prev.map(|p| p.scopes.clone()).unwrap_or_default() };
    let c = Cred {
        client_id: client_id.into(), host_id: host_id.into(), email: claims.email, subject: claims.sub, id_token,
        access_token: t.access_token, refresh_token: t.refresh_token.or_else(|| prev.map(|p| p.refresh_token.clone())).ok_or("ChatGPT sent no refresh token.")?,
        expires_at: at + t.expires_in.unwrap_or(3600), scopes, model: prev.map(|p| p.model.clone()).unwrap_or_default(),
    };
    if !c.has_plan() { return Err("ChatGPT plan use wasn't allowed. Sign in again and approve it.".into()); }
    Ok(c)
}

pub fn needs_refresh(c: &Cred, at: u64) -> bool { c.expires_at <= at + 120 }

#[cfg(feature = "ai")]
mod inference {
use super::*;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Model { pub slug: String, pub name: String }

pub fn parse_models(v: &serde_json::Value) -> Vec<Model> {
    v["models"].as_array().map(|a| a.iter().filter(|m| m["visibility"].as_str() == Some("list")).filter_map(|m| {
        let slug = m["slug"].as_str()?.to_string(); let name = m["display_name"].as_str().unwrap_or(&slug).to_string(); Some(Model { slug, name })
    }).collect()).unwrap_or_default()
}

pub fn api_error(status: u16, body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    let code = v["error"]["code"].as_str().unwrap_or("");
    match (status, code) {
        (_, "subscription_sharing_usage_limit_exceeded") | (429, _) => "You've used up your ChatGPT plan for now. Check ChatGPT settings > Usage.".into(),
        (_, "subscription_sharing_usage_unavailable") => "ChatGPT plan usage isn't available right now. Try again later.".into(),
        (_, "subscription_sharing_user_not_eligible") => "Your ChatGPT plan can't be used with Pip.".into(),
        (401, _) => "ChatGPT rejected the sign-in. Sign in again.".into(),
        (403, _) => "ChatGPT didn't allow this request for your account.".into(),
        (503, _) => "ChatGPT plan usage isn't available right now.".into(),
        _ => v["error"]["message"].as_str().map(|m| format!("ChatGPT error: {}", m.chars().take(140).collect::<String>())).unwrap_or_else(|| format!("ChatGPT error ({status}).")),
    }
}

pub async fn list_models(access: &str) -> Result<Vec<Model>, String> {
    let res = client()?.get(format!("{API_BASE}/models")).bearer_auth(access).send().await.map_err(|_| "Couldn't reach ChatGPT.".to_string())?;
    let status = res.status().as_u16(); let body = res.text().await.unwrap_or_default();
    if !(200..300).contains(&status) { return Err(api_error(status, &body)); }
    Ok(parse_models(&serde_json::from_str(&body).map_err(|_| "ChatGPT sent something unreadable.".to_string())?))
}

/// Responses API body: system text goes in `instructions`; no unsupported fields.
pub fn responses_body(model: &str, messages: &[crate::ai::Msg]) -> serde_json::Value {
    let instructions: Vec<&str> = messages.iter().filter(|m| m.role == "system").map(|m| m.content.as_str()).collect();
    let input: Vec<serde_json::Value> = messages.iter().filter(|m| m.role != "system").map(|m| serde_json::json!({ "role": m.role, "content": m.content })).collect();
    serde_json::json!({ "model": model, "instructions": if instructions.is_empty() { "You are a helpful assistant.".to_string() } else { instructions.join("\n\n") }, "input": input, "store": false, "stream": true })
}

/// Read a streamed Responses reply. Success only after `response.completed`.
pub fn parse_stream(text: &str) -> Result<String, String> {
    let (mut out, mut done) = (String::new(), false);
    for line in text.lines() {
        let Some(d) = line.strip_prefix("data:") else { continue }; let d = d.trim(); if d.is_empty() || d == "[DONE]" { continue; }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(d) else { continue };
        match v["type"].as_str() {
            Some("response.output_text.delta") => if let Some(t) = v["delta"].as_str() { out.push_str(t); },
            Some("response.failed") | Some("error") => {
                let e = if v["type"] == "error" { &v["error"] } else { &v["response"]["error"] };
                return Err(api_error(if e["code"].as_str().map_or(false, |c| c.contains("limit")) { 429 } else { 500 }, &serde_json::json!({ "error": e }).to_string()));
            }
            Some("response.incomplete") => return Err("The model stopped early.".into()),
            Some("response.completed") => done = true,
            _ => {}
        }
    }
    if !done { return Err("The reply was cut off. Try again.".into()); }
    let t = out.trim().to_string(); if t.is_empty() { Err("The model sent back nothing.".into()) } else { Ok(t) }
}

pub async fn respond(access: &str, model: &str, messages: &[crate::ai::Msg], timeout_ms: u64) -> Result<String, String> {
    let c = reqwest::Client::builder().timeout(Duration::from_millis(timeout_ms)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e| e.to_string())?;
    let res = match c.post(format!("{API_BASE}/responses")).bearer_auth(access).json(&responses_body(model, messages)).send().await {
        Ok(r) => r, Err(e) if e.is_timeout() => return Err("That took too long.".into()), Err(_) => return Err("Couldn't reach ChatGPT.".into()),
    };
    let status = res.status().as_u16(); let body = match res.text().await { Ok(b) => b, Err(e) if e.is_timeout() => return Err("That took too long.".into()), Err(_) => return Err("The reply was cut off. Try again.".into()) };
    if !(200..300).contains(&status) { return Err(api_error(status, &body)); }
    parse_stream(&body)
}

}
#[cfg(feature = "ai")]
pub use inference::*;

#[cfg(test)]
mod tests {
    use super::*;
    fn jwt(claims: serde_json::Value) -> String { format!("e30.{}.sig", B64.encode(claims.to_string())) }
    fn att() -> Attempt { Attempt { state: "st".into(), nonce: "no".into(), verifier: "ver".into() } }

    #[test] fn pkce_challenge_matches_rfc7636_example() {
        assert_eq!(challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }
    #[test] fn host_id_is_a_v4_uuid_urn_and_random() {
        let a = new_host_id(); assert!(a.starts_with("urn:uuid:") && a.len() == 9 + 36, "{a}"); assert_eq!(&a[9 + 14..9 + 15], "4"); assert_ne!(a, new_host_id());
    }
    #[test] fn first_sign_in_url_has_every_required_parameter() {
        let u = url::Url::parse(&authorize_url(None, "urn:uuid:h", 1455, &att(), None)).unwrap(); let q: std::collections::HashMap<_, _> = u.query_pairs().into_owned().collect();
        assert_eq!(u.host_str(), Some("auth.openai.com")); assert_eq!(u.path(), "/api/accounts/authorize");
        assert_eq!(q["client_id"], "dynamic_agent_client"); assert_eq!(q["agent_name_hint"], "Pip"); assert_eq!(q["ext_agent_host_id"], "urn:uuid:h");
        assert_eq!(q["response_type"], "code"); assert_eq!(q["redirect_uri"], "http://127.0.0.1:1455/auth/callback"); assert_eq!(q["resource"], "https://api.openai.com/v1");
        assert_eq!(q["scope"], "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"); assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["state"], "st"); assert_eq!(q["nonce"], "no"); assert_eq!(q["code_challenge"], challenge_for("ver"));
    }
    #[test] fn returning_sign_in_uses_issued_client_and_omits_agent_name() {
        let u = url::Url::parse(&authorize_url(Some("oaiapp_1"), "urn:uuid:h", 54321, &att(), Some("a@b.co"))).unwrap(); let q: std::collections::HashMap<_, _> = u.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "oaiapp_1"); assert!(!q.contains_key("agent_name_hint")); assert_eq!(q["login_hint"], "a@b.co");
    }
    #[test] fn callback_parsing() {
        let ok = parse_callback("GET /auth/callback?code=C1&state=st&client_id=oaiapp_9&scope=x HTTP/1.1", "st").unwrap(); assert_eq!(ok, Callback { code: "C1".into(), client_id: Some("oaiapp_9".into()) });
        assert!(parse_callback("GET /auth/callback?code=C1&state=other HTTP/1.1", "st").unwrap_err().contains("didn't match"));
        assert!(parse_callback("GET /auth/callback?error=access_denied&state=st HTTP/1.1", "st").unwrap_err().contains("cancelled"));
        assert!(parse_callback("GET /auth/callback?state=st HTTP/1.1", "st").is_err());
        assert_eq!(parse_callback("GET /callback?code=C&state=st HTTP/1.1", "st").unwrap_err(), "not the callback");
    }
    #[test] fn id_token_checks() {
        let good = jwt(serde_json::json!({"iss": ISSUER, "aud": "oaiapp_1", "exp": 2000, "nonce": "no", "sub": "u1", "email": "a@b.co"}));
        assert_eq!(check_id_token(&good, "oaiapp_1", Some("no"), 1000).unwrap(), Claims { sub: "u1".into(), email: "a@b.co".into() });
        assert!(check_id_token(&good, "other", Some("no"), 1000).is_err()); assert!(check_id_token(&good, "oaiapp_1", Some("zz"), 1000).is_err()); assert!(check_id_token(&good, "oaiapp_1", Some("no"), 9000).is_err());
        let wrong_iss = jwt(serde_json::json!({"iss": "https://evil", "aud": "oaiapp_1", "exp": 2000, "sub": "u1"})); assert!(check_id_token(&wrong_iss, "oaiapp_1", None, 1000).is_err());
        assert!(check_id_token("garbage", "oaiapp_1", None, 1000).is_err());
    }
    fn tr(scope: &str) -> TokenResponse { TokenResponse { access_token: "AT".into(), refresh_token: Some("RT".into()), id_token: Some(jwt(serde_json::json!({"iss": ISSUER, "aud": "oaiapp_1", "exp": 5000, "nonce": "no", "sub": "u1", "email": "a@b.co"}))), expires_in: Some(3600), scope: Some(scope.into()) } }
    #[test] fn credential_requires_plan_scope() {
        let c = cred_from(tr("openid email chatgpt.tokens.use.direct offline_access"), "oaiapp_1", "urn:uuid:h", Some("no"), None, 1000).unwrap();
        assert!(c.has_plan()); assert_eq!(c.expires_at, 4600); assert_eq!(c.email, "a@b.co");
        assert!(cred_from(tr("openid email"), "oaiapp_1", "urn:uuid:h", Some("no"), None, 1000).unwrap_err().contains("plan use"));
    }
    #[test] fn refresh_keeps_account_and_refuses_a_different_one() {
        let c = cred_from(tr("openid chatgpt.tokens.use.direct"), "oaiapp_1", "h", Some("no"), None, 1000).unwrap();
        let mut r = tr("openid chatgpt.tokens.use.direct"); r.id_token = None; r.refresh_token = None; r.access_token = "AT2".into();
        let c2 = cred_from(r, "oaiapp_1", "h", None, Some(&c), 2000).unwrap(); assert_eq!(c2.access_token, "AT2"); assert_eq!(c2.refresh_token, "RT"); assert_eq!(c2.subject, "u1");
        let mut other = tr("openid chatgpt.tokens.use.direct"); other.id_token = Some(jwt(serde_json::json!({"iss": ISSUER, "aud": "oaiapp_1", "exp": 5000, "nonce": "no", "sub": "u2"})));
        assert!(cred_from(other, "oaiapp_1", "h", Some("no"), Some(&c), 2000).unwrap_err().contains("different"));
        assert!(needs_refresh(&c, 4500)); assert!(!needs_refresh(&c, 1000));
    }
    #[cfg(feature = "ai")]
    #[test] fn models_keep_only_listed_in_order() {
        let v = serde_json::json!({"models": [{"slug": "a", "display_name": "A", "visibility": "list"}, {"slug": "b", "visibility": "hide"}, {"slug": "c", "visibility": "list"}]});
        assert_eq!(parse_models(&v), vec![Model { slug: "a".into(), name: "A".into() }, Model { slug: "c".into(), name: "c".into() }]);
    }
    #[cfg(feature = "ai")]
    #[test] fn request_body_follows_the_preview_rules() {
        let m = vec![crate::ai::Msg { role: "system".into(), content: "be brief".into() }, crate::ai::Msg { role: "user".into(), content: "hi".into() }];
        let b = responses_body("m1", &m);
        assert_eq!(b["store"], false); assert_eq!(b["stream"], true); assert_eq!(b["instructions"], "be brief"); assert_eq!(b["input"].as_array().unwrap().len(), 1); assert_eq!(b["input"][0]["role"], "user");
        for k in ["max_output_tokens", "temperature", "previous_response_id", "metadata", "user"] { assert!(b.get(k).is_none(), "{k}"); }
        assert!(!b["input"].to_string().contains("\"system\""));
    }
    #[cfg(feature = "ai")]
    #[test] fn stream_needs_completed_and_surfaces_failures() {
        let ok = "event: x\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"Hel\"}\n\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"lo \"}\n\ndata: {\"type\":\"response.completed\"}\n\n"; assert_eq!(parse_stream(ok).unwrap(), "Hello");
        assert!(parse_stream("data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hi\"}\n").unwrap_err().contains("cut off"));
        let lim = "data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\"}}}\n"; assert!(parse_stream(lim).unwrap_err().contains("used up"));
        assert!(parse_stream("data: {\"type\":\"response.completed\"}\n").unwrap_err().contains("nothing"));
    }
    #[cfg(feature = "ai")]
    #[test] fn http_errors_map_to_plain_words() {
        assert!(api_error(429, r#"{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}"#).contains("Usage")); assert!(api_error(403, r#"{"error":{"code":"subscription_sharing_user_not_eligible"}}"#).contains("can't be used"));
        assert!(api_error(401, r#"{"detail":"x"}"#).contains("Sign in again")); assert!(api_error(500, "{}").contains("500"));
    }
    #[tokio::test] async fn loopback_listener_returns_code_and_ignores_stray_requests() {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap(); let port = l.local_addr().unwrap().port();
        let h = tokio::spawn(async move { wait_for_callback(l, "st", Duration::from_secs(5)).await });
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for path in ["/favicon.ico", "/auth/callback?code=ZZ&state=st&client_id=oaiapp_5"] {
            let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap(); s.write_all(format!("GET {path} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes()).await.unwrap(); let mut r = String::new(); let _ = s.read_to_string(&mut r).await; assert!(r.starts_with(if path.starts_with("/fav") { "HTTP/1.1 404" } else { "HTTP/1.1 200" }), "{r}");
        }
        assert_eq!(h.await.unwrap().unwrap(), Callback { code: "ZZ".into(), client_id: Some("oaiapp_5".into()) });
    }
    #[tokio::test] async fn listener_times_out() {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap(); assert!(wait_for_callback(l, "st", Duration::from_millis(100)).await.unwrap_err().contains("timed out"));
    }
}
