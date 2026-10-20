//! Local-only, bounded text and image history. Never enters the notes/sync store.
use serde::{Deserialize, Serialize};
pub const LIMIT: usize = 50;
pub const MAX_CHARS: usize = 20_000;
pub const MAX_IMAGE_BYTES: usize = 4 * 1024 * 1024;
pub const IMAGE_BUDGET: usize = 20 * 1024 * 1024;
pub const IMAGE_LIMIT: usize = 10;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item { pub id: u64, pub text: String, #[serde(default, skip_serializing_if = "Option::is_none")] pub image: Option<String>, pub copied_at: u64 }
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct History { pub enabled: bool, pub items: Vec<Item> }
impl History {
    pub fn record(&mut self, text: String, now: u64) -> bool {
        if !self.enabled || text.trim().is_empty() || text.chars().count() > MAX_CHARS { return false; }
        self.items.retain(|i| i.image.is_some() || i.text != text);
        let id = now.max(self.items.iter().map(|i| i.id).max().unwrap_or(0).saturating_add(1));
        self.items.insert(0, Item { id, text, image: None, copied_at: now });
        self.trim(); true
    }
    pub fn record_image(&mut self, png: &[u8], now: u64) -> bool {
        if !self.enabled || png.is_empty() || png.len() > MAX_IMAGE_BYTES { return false; }
        use base64::{Engine, engine::general_purpose::STANDARD};
        let image = format!("data:image/png;base64,{}", STANDARD.encode(png));
        self.items.retain(|i| i.image.as_ref() != Some(&image));
        let id = now.max(self.items.iter().map(|i| i.id).max().unwrap_or(0).saturating_add(1));
        self.items.insert(0, Item { id, text: String::new(), image: Some(image), copied_at: now });
        self.trim(); true
    }
    // Independent pools: copying an image cannot consume a text slot, and vice versa.
    fn trim(&mut self) {
        let mut texts = 0; let mut images = 0; let mut bytes: usize = 0;
        self.items.retain(|i| {
            if let Some(s) = &i.image {
                let n = s.len().saturating_sub(22).div_ceil(4) * 3;
                if images >= IMAGE_LIMIT || bytes.saturating_add(n) > IMAGE_BUDGET { return false; }
                images += 1; bytes += n; true
            } else { texts += 1; texts <= LIMIT }
        });
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn private_by_default() { let mut h = History::default(); assert!(!h.record("secret".into(), 1)); assert!(h.items.is_empty()); }
    #[test] fn bounds_and_deduplicates() { let mut h = History { enabled: true, items: vec![] }; for i in 0..60 { h.record(format!("{i}"), i); } assert_eq!(h.items.len(), 50); h.record("40".into(), 100); assert_eq!(h.items.len(), 50); assert_eq!(h.items[0].text, "40"); assert_eq!(h.items[0].copied_at, 100); }
    #[test] fn preserves_unicode_and_whitespace_but_skips_empty_or_huge() { let mut h = History { enabled: true, items: vec![] }; assert!(h.record("  日本語\n🦄  ".into(), 1)); assert_eq!(h.items[0].text, "  日本語\n🦄  "); assert!(!h.record(" \n".into(), 2)); assert!(!h.record("a".repeat(MAX_CHARS + 1), 3)); }
    #[test] fn durable_roundtrip_and_pause() { let mut h = History { enabled: true, items: vec![] }; h.record("saved".into(), 1); h.enabled = false; let h: History = serde_json::from_str(&serde_json::to_string(&h).unwrap()).unwrap(); assert!(!h.enabled); assert_eq!(h.items[0].text, "saved"); }
}

#[cfg(test)] mod image_tests {
    use super::*;
    #[test] fn images_off_by_default_and_bounded() { let mut h = History::default(); assert!(!h.record_image(&[1],1)); h.enabled=true; assert!(!h.record_image(&vec![0;MAX_IMAGE_BYTES+1],2)); for n in 0..15 { h.record_image(&[n],n as u64); } assert_eq!(h.items.len(),IMAGE_LIMIT); }
    #[test] fn images_dedupe_and_old_text_migrates() { let mut h: History = serde_json::from_str(r#"{"enabled":true,"items":[{"id":1,"text":"old","copiedAt":1}]}"#).unwrap(); h.record_image(&[1,2,3],2); h.record_image(&[1,2,3],3); assert_eq!(h.items.len(),2); assert!(h.items[0].image.is_some()); assert_eq!(h.items[1].text,"old"); }
    #[test] fn image_budget_evicts_oldest_without_losing_text() { let mut h = History { enabled:true, items:vec![] }; h.record("keep".into(),1); for n in 0..7 { h.record_image(&vec![n;MAX_IMAGE_BYTES],n as u64+2); } assert!(h.items.iter().filter(|i|i.image.is_some()).count() <= 5); assert!(h.items.iter().any(|i|i.text=="keep")); }
}

#[cfg(test)] mod separate_budget_tests {
    use super::*;
    #[test] fn image_count_eviction_never_displaces_fifty_texts() {
        let mut h = History { enabled: true, items: vec![] };
        for n in 0..50 { h.record(format!("text {n}"),n); }
        for n in 0..15 { h.record_image(&[n],100+n as u64); }
        assert_eq!(h.items.iter().filter(|i|i.image.is_none()).count(),50);
        assert_eq!(h.items.iter().filter(|i|i.image.is_some()).count(),10);
        assert!(h.items.iter().any(|i|i.text=="text 0"));
    }
    #[test] fn text_eviction_never_displaces_ten_images() {
        let mut h = History { enabled: true, items: vec![] };
        for n in 0..10 { h.record_image(&[n],n as u64); }
        for n in 0..60 { h.record(format!("text {n}"),100+n); }
        assert_eq!(h.items.len(),60);
        assert_eq!(h.items.iter().filter(|i|i.image.is_some()).count(),10);
        assert_eq!(h.items.iter().filter(|i|i.image.is_none()).count(),50);
        assert!(!h.items.iter().any(|i|i.text=="text 0"));
    }
    #[test] fn image_byte_eviction_preserves_all_small_texts() {
        let mut h = History { enabled: true, items: vec![] };
        for n in 0..50 { h.record(format!("{n}"),n); }
        for n in 0..7 { h.record_image(&vec![n;MAX_IMAGE_BYTES],100+n as u64); }
        assert_eq!(h.items.iter().filter(|i|i.image.is_none()).count(),50);
        assert!(h.items.iter().filter(|i|i.image.is_some()).count()<=5);
    }
}
