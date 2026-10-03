//! Local-only, bounded text history. Never enters the notes/sync store.
use serde::{Deserialize, Serialize};
pub const LIMIT: usize = 50;
pub const MAX_CHARS: usize = 20_000;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item { pub id: u64, pub text: String, pub copied_at: u64 }
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct History { pub enabled: bool, pub items: Vec<Item> }
impl History {
    pub fn record(&mut self, text: String, now: u64) -> bool {
        if !self.enabled || text.trim().is_empty() || text.chars().count() > MAX_CHARS { return false; }
        self.items.retain(|i| i.text != text);
        let id = now.max(self.items.iter().map(|i| i.id).max().unwrap_or(0).saturating_add(1));
        self.items.insert(0, Item { id, text, copied_at: now });
        self.items.truncate(LIMIT); true
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn private_by_default() { let mut h = History::default(); assert!(!h.record("secret".into(), 1)); assert!(h.items.is_empty()); }
    #[test] fn bounds_and_deduplicates() { let mut h = History { enabled: true, items: vec![] }; for i in 0..60 { h.record(format!("{i}"), i); } assert_eq!(h.items.len(), 50); h.record("40".into(), 100); assert_eq!(h.items.len(), 50); assert_eq!(h.items[0].text, "40"); assert_eq!(h.items[0].copied_at, 100); }
    #[test] fn preserves_unicode_and_whitespace_but_skips_empty_or_huge() { let mut h = History { enabled: true, items: vec![] }; assert!(h.record("  日本語\n🦄  ".into(), 1)); assert_eq!(h.items[0].text, "  日本語\n🦄  "); assert!(!h.record(" \n".into(), 2)); assert!(!h.record("a".repeat(MAX_CHARS + 1), 3)); }
    #[test] fn durable_roundtrip_and_pause() { let mut h = History { enabled: true, items: vec![] }; h.record("saved".into(), 1); h.enabled = false; let h: History = serde_json::from_str(&serde_json::to_string(&h).unwrap()).unwrap(); assert!(!h.enabled); assert_eq!(h.items[0].text, "saved"); }
}
