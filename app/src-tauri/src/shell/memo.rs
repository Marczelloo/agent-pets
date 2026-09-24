//! Wartość zapamiętana dla klucza. Szukanie elementu `TaskbarFrame` przez UI Automation przechodzi
//! drzewo paska (także nasze osadzone WebView2), więc robimy je raz na uchwyt paska, a nie co sekundę.

pub struct KeyedCache<K, V> { key: Option<K>, val: Option<V> }

impl<K: PartialEq + Copy, V: Clone> KeyedCache<K, V> {
    pub fn new() -> Self { KeyedCache { key: None, val: None } }

    /// Wartość dla `key`; `find` biegnie tylko przy nowym kluczu, po `invalidate` albo po nieudanym szukaniu.
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
