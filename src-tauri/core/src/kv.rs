//! Durable key-value store: one file per key in a directory, written atomically (temp file then rename).
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum KvError { #[error("bad key")] BadKey, #[error(transparent)] Io(#[from] std::io::Error) }

pub struct FileKv { dir: PathBuf }
fn ok_key(k: &str) -> bool { !k.is_empty() && k.len() <= 80 && !k.starts_with('.') && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') }

impl FileKv {
    pub fn open(dir: impl AsRef<Path>) -> Result<Self, KvError> { fs::create_dir_all(dir.as_ref())?; Ok(Self { dir: dir.as_ref().to_path_buf() }) }
    fn path(&self, key: &str) -> Result<PathBuf, KvError> { if ok_key(key) { Ok(self.dir.join(format!("{key}.json"))) } else { Err(KvError::BadKey) } }
    pub fn get(&self, key: &str) -> Result<Option<String>, KvError> {
        match fs::read_to_string(self.path(key)?) { Ok(s) => Ok(Some(s)), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None), Err(e) => Err(e.into()) }
    }
    pub fn set(&self, key: &str, value: &str) -> Result<(), KvError> {
        let path = self.path(key)?; let tmp = self.dir.join(format!("{key}.json.tmp"));
        { let mut f = fs::File::create(&tmp)?; f.write_all(value.as_bytes())?; f.sync_all()?; }
        fs::rename(&tmp, &path)?; Ok(())
    }
    pub fn remove(&self, key: &str) -> Result<(), KvError> { match fs::remove_file(self.path(key)?) { Ok(()) => Ok(()), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(e) => Err(e.into()) } }
    pub fn all(&self) -> Result<HashMap<String, String>, KvError> {
        let mut m = HashMap::new();
        for e in fs::read_dir(&self.dir)? {
            let p = e?.path();
            if p.extension().and_then(|x| x.to_str()) != Some("json") { continue; }
            if let Some(k) = p.file_stem().and_then(|s| s.to_str()) { if ok_key(k) { if let Ok(v) = fs::read_to_string(&p) { m.insert(k.to_string(), v); } } }
        }
        Ok(m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn roundtrip_overwrite_remove() {
        let d = tempfile::tempdir().unwrap(); let kv = FileKv::open(d.path()).unwrap();
        assert_eq!(kv.get("pip.store.v1").unwrap(), None);
        kv.set("pip.store.v1", "{\"a\":1}").unwrap(); kv.set("pip.store.v1", "{\"a\":2}").unwrap();
        assert_eq!(kv.get("pip.store.v1").unwrap().unwrap(), "{\"a\":2}");
        assert_eq!(kv.all().unwrap().len(), 1);
        kv.remove("pip.store.v1").unwrap(); assert_eq!(kv.get("pip.store.v1").unwrap(), None); kv.remove("pip.store.v1").unwrap();
    }
    #[test] fn rejects_path_tricks() {
        let d = tempfile::tempdir().unwrap(); let kv = FileKv::open(d.path()).unwrap();
        for k in ["../x", "a/b", "a\\b", "", ".hidden", "x y"] { assert!(matches!(kv.set(k, "v"), Err(KvError::BadKey)), "{k}"); }
    }
    #[test] fn unicode_and_large_values() {
        let d = tempfile::tempdir().unwrap(); let kv = FileKv::open(d.path()).unwrap(); let big = "日本語🦄".repeat(200_000);
        kv.set("pip.big", &big).unwrap(); assert_eq!(kv.get("pip.big").unwrap().unwrap(), big);
    }
    #[test] fn leftover_tmp_is_ignored() {
        let d = tempfile::tempdir().unwrap(); let kv = FileKv::open(d.path()).unwrap();
        fs::write(d.path().join("pip.x.json.tmp"), "half").unwrap(); kv.set("pip.y", "1").unwrap(); assert_eq!(kv.all().unwrap().len(), 1);
    }
}
