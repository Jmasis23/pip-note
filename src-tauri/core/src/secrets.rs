//! API key storage. Windows: Credential Manager through the keyring crate. Other platforms: in memory only (dev and tests).
pub const SERVICE: &str = "com.jmasis.pip";
/// One credential per provider, e.g. "ai-nvidia", "ai-gemini".

#[cfg(windows)]
mod imp {
    use super::*;
    fn entry(a: &str) -> Result<keyring::Entry, String> { keyring::Entry::new(SERVICE, a).map_err(|e| e.to_string()) }
    pub fn get(a: &str) -> Result<Option<String>, String> { match entry(a)?.get_password() { Ok(p) => Ok(Some(p)), Err(keyring::Error::NoEntry) => Ok(None), Err(e) => Err(e.to_string()) } }
    pub fn set(a: &str, v: &str) -> Result<(), String> { entry(a)?.set_password(v).map_err(|e| e.to_string()) }
    pub fn delete(a: &str) -> Result<(), String> { match entry(a)?.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(e) => Err(e.to_string()) } }
}
#[cfg(not(windows))]
mod imp {
    use std::collections::HashMap; use std::sync::Mutex;
    static MEM: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
    pub fn get(a: &str) -> Result<Option<String>, String> { Ok(MEM.lock().unwrap().as_ref().and_then(|m| m.get(a).cloned())) }
    pub fn set(a: &str, v: &str) -> Result<(), String> { MEM.lock().unwrap().get_or_insert_with(HashMap::new).insert(a.to_string(), v.to_string()); Ok(()) }
    pub fn delete(a: &str) -> Result<(), String> { if let Some(m) = MEM.lock().unwrap().as_mut() { m.remove(a); } Ok(()) }
}
pub use imp::{delete, get, set};

#[cfg(all(test, not(windows)))]
mod tests {
    #[test] fn set_get_delete() { let a = "ai-test"; super::delete(a).unwrap(); assert_eq!(super::get(a).unwrap(), None); super::set(a, "sk-1").unwrap(); assert_eq!(super::get(a).unwrap().as_deref(), Some("sk-1")); super::delete(a).unwrap(); assert_eq!(super::get(a).unwrap(), None); }
}
