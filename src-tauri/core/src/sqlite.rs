//! SQLite persistence, acknowledged transactions and compare-and-swap across windows.
use rusqlite::{Connection, OptionalExtension};
use std::{collections::HashMap, path::Path, sync::Mutex};
pub struct SqliteKv {
    conn: Mutex<Connection>,
}
impl SqliteKv {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.busy_timeout(std::time::Duration::from_secs(3))
            .map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;").map_err(|e|e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
    pub fn get(&self, key: &str) -> Result<Option<String>, String> {
        self.conn
            .lock()
            .map_err(|e| e.to_string())?
            .query_row("SELECT value FROM kv WHERE key=?1", [key], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())
    }
    pub fn set(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .lock()
            .map_err(|e| e.to_string())?
            .execute(
                "INSERT INTO kv VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn compare_set(
        &self,
        key: &str,
        expected: Option<&str>,
        value: &str,
    ) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let old: Option<String> = tx
            .query_row("SELECT value FROM kv WHERE key=?1", [key], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if old.as_deref() != expected {
            return Err("This content changed in another window. Reload and try again; your text is still here.".into());
        }
        tx.execute(
            "INSERT INTO kv VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn all(&self) -> Result<HashMap<String, String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT key,value FROM kv")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<HashMap<_, _>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn backup(&self, path: &Path) -> Result<(), String> {
        self.conn
            .lock()
            .map_err(|e| e.to_string())?
            .backup(rusqlite::MAIN_DB, path, None)
            .map_err(|e| e.to_string())
    }
    pub fn restore(&self, path: &Path) -> Result<(), String> {
        let source = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
        let check: String = source
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if check != "ok" {
            return Err("Backup integrity check failed. Your current data was preserved.".into());
        }
        source
            .prepare("SELECT key,value FROM kv")
            .map_err(|_| "Not a Pip backup".to_string())?;
        let mut stmt = source
            .prepare("SELECT key,value FROM kv")
            .map_err(|e| e.to_string())?;
        let entries = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for entry in entries {
            let (k, v) = entry.map_err(|e| e.to_string())?;
            validate_backup_value(&k, &v)?;
        }
        drop(stmt);
        let mut dest = self.conn.lock().map_err(|e| e.to_string())?;
        let backup =
            rusqlite::backup::Backup::new(&source, &mut dest).map_err(|e| e.to_string())?;
        backup
            .run_to_completion(100, std::time::Duration::from_millis(5), None)
            .map_err(|e| e.to_string())
    }
    pub fn migrate(&self, old: &crate::kv::FileKv) -> Result<(), String> {
        for (k, v) in old.all().map_err(|e| e.to_string())? {
            if self.get(&k)?.is_none() {
                self.set(&k, &v)?;
            }
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restart_cas_and_backup() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("pip.db");
        {
            let db = SqliteKv::open(&path).unwrap();
            db.compare_set("pip.companion.v1", None, "日本語\n🦄")
                .unwrap();
            assert!(db.compare_set("pip.companion.v1", None, "stale").is_err());
            db.backup(&d.path().join("backup.db")).unwrap();
        }
        let db = SqliteKv::open(&path).unwrap();
        assert_eq!(db.get("pip.companion.v1").unwrap().unwrap(), "日本語\n🦄");
        let backup = SqliteKv::open(d.path().join("backup.db")).unwrap();
        assert_eq!(
            backup.get("pip.companion.v1").unwrap(),
            db.get("pip.companion.v1").unwrap()
        );
    }
    #[test]
    fn corrupt_database_is_not_replaced() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("broken.db");
        std::fs::write(&p, b"broken").unwrap();
        assert!(SqliteKv::open(&p).is_err());
        assert_eq!(std::fs::read(&p).unwrap(), b"broken");
    }
}
#[cfg(test)]
mod restore_tests {
    use super::*;
    #[test]
    fn malformed_content_restore_preserves_current_database() {
        let d = tempfile::tempdir().unwrap();
        let live = SqliteKv::open(d.path().join("live.db")).unwrap();
        live.set("pip.companion.v1", "current").unwrap();
        let broken = SqliteKv::open(d.path().join("broken.db")).unwrap();
        broken
            .set(
                "pip.companion.v1",
                r#"{"version":1,"items":[],"draft":{"body":42}}"#,
            )
            .unwrap();
        assert!(live.restore(&d.path().join("broken.db")).is_err());
        assert_eq!(
            live.get("pip.companion.v1").unwrap().as_deref(),
            Some("current")
        );
    }
}

fn validate_backup_value(key: &str, value: &str) -> Result<(), String> {
    let parse = || {
        serde_json::from_str::<serde_json::Value>(value)
            .map_err(|_| format!("Backup contains invalid {key}. Current data was preserved."))
    };
    match key {
        "pip.companion.v1" => {
            let s = parse()?;
            let input = |n: &serde_json::Value| -> bool {
                ["kind", "title", "body", "project"]
                    .iter()
                    .all(|k| n[k].is_string())
                    && [
                        "note",
                        "checklist",
                        "link",
                        "image",
                        "file",
                        "snippet",
                        "task",
                        "resume",
                    ]
                    .contains(&n["kind"].as_str().unwrap_or(""))
                    && ["due", "waiting", "next", "resources", "image"]
                        .iter()
                        .all(|k| n.get(k).map_or(true, |v| v.is_string()))
                    && n.get("done").map_or(true, |v| v.is_boolean())
                    && n.get("checklist").map_or(true, |v| {
                        v.as_array().map_or(false, |a| {
                            a.iter()
                                .all(|c| c["text"].is_string() && c["done"].is_boolean())
                        })
                    })
                    && n.get("attachments").map_or(true, |v| {
                        v.as_array().map_or(false, |a| {
                            a.iter().all(|x| {
                                x["id"].is_string()
                                    && x["name"].is_string()
                                    && ["copy", "shortcut"]
                                        .contains(&x["mode"].as_str().unwrap_or(""))
                            })
                        })
                    })
            };
            let mut ids = std::collections::HashSet::new();
            let ok = s["version"] == 1
                && s["items"].as_array().map_or(false, |a| {
                    a.iter().all(|n| {
                        input(n)
                            && n["id"]
                                .as_str()
                                .map_or(false, |id| ids.insert(id.to_owned()))
                            && n["revision"].as_u64().map_or(false, |r| r > 0)
                            && n["updated"].is_number()
                            && n["pinned"].is_boolean()
                    })
                })
                && s["projects"]
                    .as_array()
                    .map_or(false, |a| a.iter().all(|v| v.is_string()))
                && ["light", "dark", "system"]
                    .contains(&s["prefs"]["theme"].as_str().unwrap_or(""))
                && [
                    "mascot",
                    "reducedMotion",
                    "trayOnClose",
                    "startup",
                    "notifications",
                    "onboarded",
                ]
                .iter()
                .all(|k| s["prefs"][k].is_boolean())
                && (s["draft"].is_null() || input(&s["draft"]))
                && s.get("drafts").map_or(true, |d| {
                    d.as_object().map_or(false, |d| d.values().all(input))
                });
            if !ok {
                return Err("Backup contains damaged content. Current data was preserved.".into());
            }
        }
        "landmarks" => {
            let layout: crate::landmarks::Layout =
                serde_json::from_str(value).map_err(|e| e.to_string())?;
            crate::landmarks::validate(&layout.landmarks).map_err(|e| e.to_string())?;
            if layout
                .monitors
                .iter()
                .any(|m| m.w == 0 || m.h == 0 || !m.scale.is_finite() || m.scale <= 0.0)
            {
                return Err("Backup contains invalid monitors".into());
            }
        }
        "gesture-options" => {
            let _: crate::landmarks::GestureOpts =
                serde_json::from_str(value).map_err(|e| e.to_string())?;
        }
        "gesture-policy" => {
            let p = parse()?;
            if !p["fullscreen"].is_boolean()
                || p["exclusions"]
                    .as_array()
                    .map_or(true, |a| a.iter().any(|x| !x.is_string()))
            {
                return Err("Invalid gesture policy in backup".into());
            }
        }
        "clipboard-history" => {
            let _: crate::clipboard::History =
                serde_json::from_str(value).map_err(|e| e.to_string())?;
        }
        "clipboard-config" => {
            let c = parse()?;
            if !c["limit"].is_u64()
                || !c["days"].is_u64()
                || c["pinned"]
                    .as_array()
                    .map_or(true, |a| a.iter().any(|x| !x.is_u64()))
                || c["exclusions"]
                    .as_array()
                    .map_or(true, |a| a.iter().any(|x| !x.is_string()))
            {
                return Err("Invalid clipboard configuration in backup".into());
            }
        }
        _ => {}
    }
    Ok(())
}
