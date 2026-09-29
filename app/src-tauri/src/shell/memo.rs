//! Cached value for a key. Finding `TaskbarFrame` through UI Automation traverses the taskbar tree
//! (including our embedded WebView2), so do it once per taskbar handle instead of every second.

pub struct KeyedCache<K, V> { key: Option<K>, val: Option<V> }

impl<K: PartialEq + Copy, V: Clone> KeyedCache<K, V> {
    pub fn new() -> Self { KeyedCache { key: None, val: None } }

    /// Value for `key`; `find` runs only for a new key, after `invalidate`, or after a failed search.
    pub fn get(&mut self, key: K, find: impl FnOnce() -> Option<V>) -> Option<V> {
        if self.key != Some(key) || self.val.is_none() {
            self.key = Some(key);
            self.val = find();
        }
        self.val.clone()
    }

    pub fn invalidate(&mut self) { self.val = None; }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn finds_once_per_key() {
        let calls = Cell::new(0);
        let mut c = KeyedCache::new();
        let find = || { calls.set(calls.get() + 1); Some("frame") };
        assert_eq!(c.get(1, find), Some("frame"));
        assert_eq!(c.get(1, find), Some("frame"));
        assert_eq!(calls.get(), 1);
        assert_eq!(c.get(2, find), Some("frame"));
        assert_eq!(calls.get(), 2);
    }

    #[test]
    fn searches_again_after_invalidate_or_a_failed_find() {
        let calls = Cell::new(0);
        let mut c: KeyedCache<i32, &str> = KeyedCache::new();
        assert_eq!(c.get(1, || { calls.set(calls.get() + 1); None }), None);
        assert_eq!(c.get(1, || { calls.set(calls.get() + 1); Some("frame") }), Some("frame"));
        c.invalidate();
        assert_eq!(c.get(1, || { calls.set(calls.get() + 1); Some("new") }), Some("new"));
        assert_eq!(calls.get(), 3);
    }
}
