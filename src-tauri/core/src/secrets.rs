//! API key storage. Windows: Credential Manager through the keyring crate. Other platforms: in memory only (dev and tests).
pub const SERVICE: &str = "com.jmasis.pip";
pub const ACCOUNT: &str = "ai-api-key";

#[cfg(windows)]
mod imp {
    use super::*;
    fn entry() -> Result<keyring::Entry, String> { keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string()) }
    pub fn get() -> Result<Option<String>, String> { match entry()?.get_password() { Ok(p) => Ok(Some(p)), Err(keyring::Error::NoEntry) => Ok(None), Err(e) => Err(e.to_string()) } }
    pub fn set(v: &str) -> Result<(), String> { entry()?.set_password(v).map_err(|e| e.to_string()) }
    pub fn delete() -> Result<(), String> { match entry()?.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(e) => Err(e.to_string()) } }
}
#[cfg(not(windows))]
mod imp {
    use std::sync::Mutex;
    static MEM: Mutex<Option<String>> = Mutex::new(None);
    pub fn get() -> Result<Option<String>, String> { Ok(MEM.lock().unwrap().clone()) }
    pub fn set(v: &str) -> Result<(), String> { *MEM.lock().unwrap() = Some(v.to_string()); Ok(()) }
    pub fn delete() -> Result<(), String> { *MEM.lock().unwrap() = None; Ok(()) }
}
pub use imp::{delete, get, set};

#[cfg(all(test, not(windows)))]
mod tests {
    #[test] fn set_get_delete() { super::delete().unwrap(); assert_eq!(super::get().unwrap(), None); super::set("sk-1").unwrap(); assert_eq!(super::get().unwrap().as_deref(), Some("sk-1")); super::delete().unwrap(); assert_eq!(super::get().unwrap(), None); }
}
