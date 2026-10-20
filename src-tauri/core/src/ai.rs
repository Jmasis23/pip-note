//! OpenAI-compatible chat completion from the Rust side. No browser CORS, and the key never reaches the web view.
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Msg { pub role: String, pub content: String }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint { pub base_url: String, pub model: String }

pub fn local_host(h: &str) -> bool { h == "localhost" || h == "127.0.0.1" || h == "[::1]" || h == "::1" }
pub fn normalize_base(u: &str) -> String { u.trim().trim_end_matches('/').to_string() }
pub fn valid_base(u: &str) -> bool {
    match url::Url::parse(&normalize_base(u)) { Ok(p) => p.scheme() == "https" || (p.scheme() == "http" && p.host_str().map_or(false, local_host)), Err(_) => false }
}
pub fn is_local(u: &str) -> bool { url::Url::parse(u).ok().and_then(|p| p.host_str().map(local_host)).unwrap_or(false) }

/// Same wording as the browser path in src/ai.ts so the UI reads the same either way.
pub async fn complete(ep: &Endpoint, key: Option<&str>, messages: &[Msg], max_tokens: u32, timeout_ms: u64) -> Result<String, String> {
    if !valid_base(&ep.base_url) { return Err("The address must be https, or http for a local model.".into()); }
    let base = normalize_base(&ep.base_url);
    let host = url::Url::parse(&base).ok().and_then(|u| u.host_str().map(|s| s.to_string())).unwrap_or_default();
    let client = reqwest::Client::builder().timeout(Duration::from_millis(timeout_ms)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e| e.to_string())?;
    let mut req = client.post(format!("{base}/chat/completions")).json(&serde_json::json!({ "model": ep.model, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens }));
    if let Some(k) = key.filter(|k| !k.is_empty()) { req = req.bearer_auth(k); }
    let res = match req.send().await {
        Ok(r) => r,
        Err(e) if e.is_timeout() => return Err("That took too long.".into()),
        Err(_) => return Err(format!("Couldn't reach {host}. Check the address and that it is running.")),
    };
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        let detail = res.json::<serde_json::Value>().await.ok().and_then(|v| v["error"]["message"].as_str().map(|s| s.chars().take(140).collect::<String>())).unwrap_or_default();
        return Err(match status {
            401 | 403 => "The provider rejected the key.".into(),
            404 => "Endpoint or model not found. Check the model name.".into(),
            429 => "Rate limited or out of credit.".into(),
            _ if !detail.is_empty() => format!("Provider error: {detail}"),
            _ => format!("Provider error ({status})."),
        });
    }
    let v: serde_json::Value = res.json().await.map_err(|_| "The provider sent something unreadable.".to_string())?;
    match v["choices"][0]["message"]["content"].as_str().map(|s| s.trim().to_string()) {
        Some(t) if !t.is_empty() => Ok(t),
        _ => Err("The model sent back nothing.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// One-shot HTTP server. Returns (base_url, receiver of the raw request text).
    async fn serve(status: u16, body: &'static str) -> (String, tokio::sync::oneshot::Receiver<String>) {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap(); let addr = l.local_addr().unwrap();
        let (tx, rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let (mut s, _) = l.accept().await.unwrap(); let mut buf = vec![0u8; 16384]; let mut got = 0;
            loop { let n = s.read(&mut buf[got..]).await.unwrap(); got += n; let t = String::from_utf8_lossy(&buf[..got]).to_string();
                if let Some(i) = t.find("\r\n\r\n") { let cl = t.to_lowercase().split("content-length:").nth(1).and_then(|x| x.split("\r\n").next()).and_then(|x| x.trim().parse::<usize>().ok()).unwrap_or(0); if got >= i + 4 + cl { break; } } if n == 0 { break; } }
            let _ = tx.send(String::from_utf8_lossy(&buf[..got]).to_string());
            let resp = format!("HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            s.write_all(resp.as_bytes()).await.unwrap(); let _ = s.shutdown().await;
        });
        (format!("http://127.0.0.1:{}/v1", addr.port()), rx)
    }
    fn ep(b: String) -> Endpoint { Endpoint { base_url: b, model: "m".into() } }
    fn user() -> Vec<Msg> { vec![Msg { role: "user".into(), content: "hi".into() }] }

    #[test] fn url_rules() {
        assert!(valid_base("https://api.openai.com/v1/")); assert!(valid_base("http://localhost:11434/v1")); assert!(valid_base("http://127.0.0.1:1/v1"));
        assert!(!valid_base("http://evil.example.com/v1")); assert!(!valid_base("ftp://x")); assert!(!valid_base("nope"));
    }
    #[tokio::test] async fn sends_bearer_model_and_path_then_returns_text() {
        let (b, rx) = serve(200, r#"{"choices":[{"message":{"content":" hello "}}]}"#).await;
        let out = complete(&ep(b), Some("sk-good"), &user(), 50, 5000).await.unwrap(); assert_eq!(out, "hello");
        let raw = rx.await.unwrap().to_lowercase();
        assert!(raw.starts_with("post /v1/chat/completions"), "{raw}"); assert!(raw.contains("authorization: bearer sk-good")); assert!(raw.contains("\"model\":\"m\""));
    }
    #[tokio::test] async fn no_auth_header_without_key() {
        let (b, rx) = serve(200, r#"{"choices":[{"message":{"content":"y"}}]}"#).await; complete(&ep(b), None, &user(), 5, 5000).await.unwrap();
        assert!(!rx.await.unwrap().to_lowercase().contains("authorization"));
    }
    #[tokio::test] async fn maps_errors() {
        for (st, body, want) in [(401u16, "{}", "rejected the key"), (404, "{}", "not found"), (429, "{}", "Rate limited"), (500, r#"{"error":{"message":"boom"}}"#, "boom"), (200, "not json", "unreadable"), (200, r#"{"choices":[{"message":{"content":""}}]}"#, "nothing")] {
            let (b, _rx) = serve(st, body).await; let e = complete(&ep(b), Some("k"), &user(), 5, 5000).await.unwrap_err(); assert!(e.contains(want), "{st}: {e}");
        }
    }
    #[tokio::test] async fn unreachable_is_plain() {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap(); let port = l.local_addr().unwrap().port(); drop(l);
        let e = complete(&ep(format!("http://127.0.0.1:{port}/v1")), None, &user(), 5, 2000).await.unwrap_err(); assert!(e.contains("Couldn't reach"), "{e}");
    }
    #[tokio::test] async fn refuses_plain_http_to_remote_hosts() {
        let e = complete(&ep("http://evil.example.com/v1".into()), Some("k"), &user(), 5, 1000).await.unwrap_err(); assert!(e.contains("https"));
    }
    #[tokio::test] async fn does_not_follow_redirects_with_the_key() {
        let (b, _rx) = serve(302, "").await; let e = complete(&ep(b), Some("k"), &user(), 5, 3000).await.unwrap_err(); assert!(e.starts_with("Provider error"), "{e}");
    }
}
