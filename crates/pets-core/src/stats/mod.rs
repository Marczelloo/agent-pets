//! Statystyki pracy agentów (spec 0.9): sumy tokenów, czasu pracy, pytań i narzędzi per plik historii,
//! w kubełkach kwadrans (UTC) × model. Tylko liczby, nazwy folderów projektów i modeli; bez treści.
pub mod active;
pub mod book;
pub mod claude;
pub mod codex;
#[cfg(feature = "opencode-db")]
pub mod opencode;
pub mod scan;
pub mod summary;

pub use active::active_tick;
pub use book::Book;

use std::collections::{BTreeMap, BTreeSet};
use serde::{Deserialize, Serialize};
use crate::model::Tool;

pub const HOUR_MS: i64 = 3_600_000;
/// Kubełek czasu w księdze: kwadrans mieści każde prawdziwe przesunięcie strefy (+5:30, +5:45), więc praca po
/// lokalnej północy nie trafia do poprzedniego dnia (przegląd 0.9, I2).
pub const BUCKET_MS: i64 = 15 * 60_000;
/// Dłuższa przerwa między zdarzeniami agenta to pauza, nie praca (spec 2.3).
pub const GAP_MS: i64 = 5 * 60_000;

/// Wywołania narzędzi według rodzaju (ten sam podział co `Tool`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tools { pub edit: u32, pub bash: u32, pub read: u32, pub grep: u32, pub web: u32, pub agent: u32, pub mcp: u32, pub other: u32 }

impl Tools {
    pub fn add(&mut self, t: Tool) {
        *match t {
            Tool::Edit => &mut self.edit, Tool::Bash => &mut self.bash, Tool::Read => &mut self.read, Tool::Grep => &mut self.grep,
            Tool::Web => &mut self.web, Tool::Agent => &mut self.agent, Tool::Mcp => &mut self.mcp, Tool::Other => &mut self.other,
        } += 1;
    }
    fn add_all(&mut self, o: &Tools) {
        for (a, b) in [(&mut self.edit, o.edit), (&mut self.bash, o.bash), (&mut self.read, o.read), (&mut self.grep, o.grep),
            (&mut self.web, o.web), (&mut self.agent, o.agent), (&mut self.mcp, o.mcp), (&mut self.other, o.other)] { *a += b; }
    }
}

/// Sumy jednej godziny i jednego modelu w jednym pliku.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cell { pub input: u64, pub cache_read: u64, pub cache_write: u64, pub output: u64, pub active_ms: u64, pub questions: u32, pub tools: Tools }

impl Cell {
    pub fn add(&mut self, o: &Cell) {
        self.input += o.input;
        self.cache_read += o.cache_read;
        self.cache_write += o.cache_write;
        self.output += o.output;
        self.active_ms += o.active_ms;
        self.questions += o.questions;
        self.tools.add_all(&o.tools);
    }
    pub fn tokens(&self) -> u64 { self.input + self.cache_read + self.cache_write + self.output }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatAgent { Claude, Codex, Router, Opencode }

/// Kto i gdzie: agent, projekt (ostatni człon `cwd`), czy to subagent, kiedy plik się zaczął.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct FileMeta { pub agent: Option<StatAgent>, pub project: Option<String>, pub sub: bool, pub started: Option<i64> }

/// Gdzie skończyliśmy czytać plik i stan potrzebny, by czytać dalej bez podwójnego liczenia.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Cursor {
    pub offset: u64,
    pub size: u64,
    pub mtime: i64,
    pub last_event: Option<i64>,
    pub line: u64,
    pub skip_until: u64,
    /// Claude: ostatnia odpowiedź (`message.id`) i jej wkład w tokeny (powtarza się w kolejnych wierszach)
    pub last_msg: Option<(String, Cell)>,
    /// Codex: ostatnia suma narastająca `[input bez cache, cache_read, cache_write, output]`
    pub last_total: Option<[u64; 4]>,
    pub model: Option<String>,
    /// Claude: skróty (FNV-1a) `message.id` już policzonych odpowiedzi; Claude Code dopisuje starsze odpowiedzi
    /// jeszcze raz przy wznowieniu i kompaktowaniu (przegląd 0.9, C1)
    #[serde(default)]
    pub seen: BTreeSet<u64>,
}

/// Wpis księgi dla jednego pliku historii: kursor, metadane i wkład (kwadrans UTC → model → sumy).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct FileEntry { pub cursor: Cursor, pub meta: FileMeta, pub buckets: BTreeMap<i64, BTreeMap<String, Cell>> }

impl FileEntry {
    pub fn cell(&mut self, ts: i64, model: &str) -> &mut Cell {
        self.buckets.entry(ts.div_euclid(BUCKET_MS)).or_default().entry(model.to_string()).or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Tool;

    #[test]
    fn a_cell_lands_in_its_utc_hour_bucket() {
        let mut e = FileEntry::default();
        e.cell(2 * BUCKET_MS + 5, "m").input += 3;
        e.cell(-1, "m").output += 1;
        assert_eq!(e.buckets.keys().copied().collect::<Vec<_>>(), [-1, 2]);
        assert_eq!(e.buckets[&2]["m"].input, 3);
        assert_eq!(BUCKET_MS, 15 * 60_000, "a quarter hour fits every real timezone offset");
    }

    #[test]
    fn cells_add_up_and_count_tokens() {
        let mut a = Cell { input: 1, cache_read: 2, cache_write: 3, output: 4, active_ms: 5, questions: 1, ..Cell::default() };
        a.tools.add(Tool::Bash);
        let b = a;
        a.add(&b);
        assert_eq!((a.input, a.cache_read, a.cache_write, a.output, a.active_ms, a.questions, a.tools.bash), (2, 4, 6, 8, 10, 2, 2));
        assert_eq!(b.tokens(), 10);
    }

    #[test]
    fn every_tool_has_its_counter() {
        let mut t = Tools::default();
        for x in [Tool::Edit, Tool::Bash, Tool::Read, Tool::Grep, Tool::Web, Tool::Agent, Tool::Mcp, Tool::Other] { t.add(x); }
        assert_eq!(t, Tools { edit: 1, bash: 1, read: 1, grep: 1, web: 1, agent: 1, mcp: 1, other: 1 });
    }
}
