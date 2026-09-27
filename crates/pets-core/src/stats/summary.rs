//! Widok okna „Statystyki” (spec 3.1) liczony z księgi. Dzień lokalny i pora nocna wynikają z godziny UTC
//! i przesunięcia strefy `tz(ts)` podanego z zewnątrz, więc zmiana strefy nie psuje zapisanych danych.
use std::collections::{BTreeMap, HashMap};
use serde::{Deserialize, Serialize};
use super::{Book, Cell, StatAgent, HOUR_MS};

const DAY: i64 = 86_400_000;
const CALENDAR_DAYS: i64 = 182;
const NIGHT_MIN_MS: u64 = 30 * 60_000;
const RECORD_MIN_MS: u64 = 3_600_000;
const CACHE_MIN_TOKENS: u64 = 1_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Period { Today, Week, Month, All }
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Metric { Time, Tokens }
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RaceBy { Agents, Projects }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
pub struct Query { pub period: Period, pub metric: Metric, pub race: RaceBy }

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Place { pub project: String, pub value: u64, pub agent: StatAgent }
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Tiles {
    pub tokens: u64, pub tokens_change: Option<f64>, pub cache_pct: Option<f64>, pub cache_read: u64,
    pub active_ms: u64, pub longest_ms: u64, pub sessions: u32, pub subagents: u32, pub questions: u32,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Lane { pub key: String, pub agent: Option<StatAgent>, pub value: u64 }
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Day { pub date: String, pub active_ms: u64, pub level: u8 }
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BadgeKind { Glutton, CacheMaster, NightOwl, Marathon }
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Badge { pub kind: BadgeKind, pub project: Option<String>, pub agent: Option<StatAgent>, pub value: u64 }
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct StatsView {
    pub empty: bool, pub podium: Vec<Place>, pub tiles: Tiles, pub race: Vec<Lane>,
    pub calendar: Vec<Day>, pub badges: Vec<Badge>, pub record: bool,
}

/// Numer dnia lokalnego (dni od epoki) dla chwili `ts`.
pub fn local_day(ts: i64, tz: &dyn Fn(i64) -> i64) -> i64 { (ts + tz(ts)).div_euclid(DAY) }
fn local_hour(ts: i64, tz: &dyn Fn(i64) -> i64) -> i64 { (ts + tz(ts)).rem_euclid(DAY) / HOUR_MS }
fn date_of(day: i64) -> String { crate::time::rfc3339(day * DAY)[..10].to_string() }
fn pct(part: u64, whole: u64) -> Option<f64> { (whole > 0).then(|| part as f64 * 100.0 / whole as f64) }

#[derive(Default)]
struct Project { cell: Cell, by_agent: HashMap<StatAgent, u64> }
impl Project {
    /// Agent, który w projekcie pracował najdłużej (przy remisie pierwszy w kolejności Claude, Codex, Router).
    fn agent(&self) -> StatAgent {
        self.by_agent.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map(|x| *x.0).unwrap_or(StatAgent::Claude)
    }
}

pub fn summary(book: &Book, q: &Query, now: i64, tz: &dyn Fn(i64) -> i64) -> StatsView {
    let today = local_day(now, tz);
    let len = match q.period { Period::Today => Some(1), Period::Week => Some(7), Period::Month => Some(30), Period::All => None };
    let from = len.map(|n| today - n + 1);
    let in_cur = |d: i64| from.is_none_or(|f| d >= f && d <= today);
    let in_prev = |d: i64| len.zip(from).is_some_and(|(n, f)| d >= f - n && d < f);
    let value = |c: &Cell| match q.metric { Metric::Time => c.active_ms, Metric::Tokens => c.tokens() };

    let (mut empty, mut total, mut prev_tokens, mut night) = (true, Cell::default(), 0u64, 0u64);
    let (mut sessions, mut subagents) = (0u32, 0u32);
    let mut projects: BTreeMap<String, Project> = BTreeMap::new();
    let mut agents: BTreeMap<StatAgent, Cell> = BTreeMap::new();
    let mut days: BTreeMap<i64, u64> = BTreeMap::new();
    let mut longest: (u64, Option<String>, Option<StatAgent>) = (0, None, None);

    for e in book.files.values() {
        let Some(agent) = e.meta.agent else { continue };
        if e.meta.started.is_some_and(|s| in_cur(local_day(s, tz))) {
            if e.meta.sub { subagents += 1 } else { sessions += 1 }
        }
        let mut file_active = 0u64;
        for (&h, models) in &e.buckets {
            let ts = h * super::BUCKET_MS;
            let d = local_day(ts, tz);
            for c in models.values() {
                empty = false;
                *days.entry(d).or_default() += c.active_ms;
                if in_prev(d) { prev_tokens += c.tokens(); }
                if !in_cur(d) { continue; }
                total.add(c);
                agents.entry(agent).or_default().add(c);
                file_active += c.active_ms;
                if let Some(p) = &e.meta.project {
                    let x = projects.entry(p.clone()).or_default();
                    x.cell.add(c);
                    *x.by_agent.entry(agent).or_default() += c.active_ms;
                }
                if matches!(local_hour(ts, tz), 23 | 0..=4) { night += c.active_ms; }
            }
        }
        if !e.meta.sub && file_active > longest.0 { longest = (file_active, e.meta.project.clone(), Some(agent)); }
    }

    let mut ranked: Vec<(&String, &Project)> = projects.iter().filter(|(_, p)| value(&p.cell) > 0).collect();
    ranked.sort_by(|a, b| value(&b.1.cell).cmp(&value(&a.1.cell)).then(a.0.cmp(b.0)));
    let podium = ranked.iter().take(3).map(|(n, p)| Place { project: (*n).clone(), value: value(&p.cell), agent: p.agent() }).collect();
    let race = match q.race {
        RaceBy::Agents => [(StatAgent::Claude, "claude"), (StatAgent::Codex, "codex"), (StatAgent::Router, "router"), (StatAgent::Opencode, "opencode")].iter()
            .filter_map(|(a, k)| agents.get(a).map(|c| value(c)).filter(|&v| v > 0).map(|v| Lane { key: k.to_string(), agent: Some(*a), value: v }))
            .collect(),
        RaceBy::Projects => ranked.iter().take(5).map(|(n, p)| Lane { key: (*n).clone(), agent: Some(p.agent()), value: value(&p.cell) }).collect(),
    };

    let cur_tokens = total.tokens();
    let tiles = Tiles {
        tokens: cur_tokens,
        tokens_change: len.and(pct(cur_tokens, prev_tokens)).map(|p| p - 100.0),
        cache_pct: pct(total.cache_read, total.input + total.cache_read + total.cache_write),
        cache_read: total.cache_read,
        active_ms: total.active_ms,
        longest_ms: longest.0,
        sessions, subagents, questions: total.questions,
    };

    let range: Vec<i64> = (today - CALENDAR_DAYS + 1..=today).collect();
    let mut active: Vec<u64> = range.iter().filter_map(|d| days.get(d).copied()).filter(|&v| v > 0).collect();
    active.sort_unstable();
    let quart = |p: f64| active.get(((active.len().saturating_sub(1)) as f64 * p) as usize).copied().unwrap_or(0);
    let (q1, q2, q3) = (quart(0.25), quart(0.5), quart(0.75));
    let calendar = range.iter().map(|&d| {
        let ms = days.get(&d).copied().unwrap_or(0);
        let level = if ms == 0 { 0 } else if ms <= q1 { 1 } else if ms <= q2 { 2 } else if ms <= q3 { 3 } else { 4 };
        Day { date: date_of(d), active_ms: ms, level }
    }).collect();

    let mut badges = Vec::new();
    if let Some((n, p)) = projects.iter().filter(|(_, p)| p.cell.tokens() > 0).max_by(|a, b| a.1.cell.tokens().cmp(&b.1.cell.tokens()).then(b.0.cmp(a.0))) {
        badges.push(Badge { kind: BadgeKind::Glutton, project: Some(n.clone()), agent: Some(p.agent()), value: p.cell.tokens() });
    }
    let cache = |c: &Cell| pct(c.cache_read, c.input + c.cache_read + c.cache_write).unwrap_or(0.0);
    if let Some((n, p)) = projects.iter().filter(|(_, p)| p.cell.tokens() >= CACHE_MIN_TOKENS)
        .max_by(|a, b| cache(&a.1.cell).total_cmp(&cache(&b.1.cell)).then(b.0.cmp(a.0))) {
        badges.push(Badge { kind: BadgeKind::CacheMaster, project: Some(n.clone()), agent: Some(p.agent()), value: cache(&p.cell).round() as u64 });
    }
    if night >= NIGHT_MIN_MS { badges.push(Badge { kind: BadgeKind::NightOwl, project: None, agent: None, value: night }); }
    if longest.0 > 0 { badges.push(Badge { kind: BadgeKind::Marathon, project: longest.1, agent: longest.2, value: longest.0 }); }

    let today_ms = days.get(&today).copied().unwrap_or(0);
    let best_before = days.range(..today).map(|(_, &v)| v).filter(|&v| v > 0).max();
    let record = today_ms >= RECORD_MIN_MS && best_before.is_some_and(|b| today_ms > b);

    StatsView { empty, podium, tiles, race, calendar, badges, record }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{Book, Cell, FileEntry, FileMeta, StatAgent, HOUR_MS};

    const DAY_MS: i64 = 86_400_000;
    /// 2026-09-27 00:00 UTC
    const D0: i64 = 1_790_467_200_000;
    const NOW: i64 = D0 + 12 * HOUR_MS;
    const MIN: u64 = 60_000;
    const H: u64 = 60 * MIN;

    fn utc(_: i64) -> i64 { 0 }
    fn q(period: Period, metric: Metric, race: RaceBy) -> Query { Query { period, metric, race } }
    fn week() -> Query { q(Period::Week, Metric::Time, RaceBy::Agents) }
    /// godzina UTC `hour` dnia `day` (0 = dziś, −1 = wczoraj)
    fn at(day: i64, hour: i64) -> i64 { D0 + day * DAY_MS + hour * HOUR_MS }
    fn meta(agent: StatAgent, project: &str, sub: bool, started: i64) -> FileMeta {
        FileMeta { agent: Some(agent), project: Some(project.into()), sub, started: Some(started) }
    }
    fn put(b: &mut Book, path: &str, m: FileMeta, ts: i64, c: Cell) {
        let e = b.files.entry(path.into()).or_insert_with(|| FileEntry { meta: m, ..FileEntry::default() });
        e.cell(ts, "m").add(&c);
    }
    fn work(ms: u64) -> Cell { Cell { active_ms: ms, ..Cell::default() } }
    fn tok(n: u64) -> Cell { Cell { input: n, ..Cell::default() } }

    #[test]
    fn an_empty_book_is_empty_and_calm() {
        let v = summary(&Book::default(), &week(), NOW, &utc);
        assert!(v.empty && v.podium.is_empty() && v.race.is_empty() && v.badges.is_empty() && !v.record);
        assert_eq!((v.tiles.tokens, v.tiles.tokens_change, v.tiles.cache_pct), (0, None, None));
        assert_eq!(v.calendar.len(), 182);
    }

    #[test]
    fn hours_fall_into_local_days() {
        assert_eq!(local_day(at(-1, 22), &|_| 2 * HOUR_MS), local_day(at(0, 0), &utc), "22:00 UTC at +2 h is the next day");
        assert_eq!(local_day(at(0, 22), &|_| -5 * HOUR_MS), local_day(at(0, 0), &utc), "at −5 h it is the same day");
        let mut b = Book::default();
        put(&mut b, "a", meta(StatAgent::Claude, "p", false, at(0, 1)), at(-1, 23), work(10 * MIN));
        let today = |tz: &dyn Fn(i64) -> i64| summary(&b, &q(Period::Today, Metric::Time, RaceBy::Agents), NOW, tz).tiles.active_ms;
        assert_eq!(today(&utc), 0);
        assert_eq!(today(&|_| 2 * HOUR_MS), 10 * MIN);
    }

    #[test]
    fn half_hour_timezones_put_work_on_the_right_day() {
        // 00:10 w Indiach (+5:30) to 18:40 UTC dnia poprzedniego
        let mut b = Book::default();
        put(&mut b, "a", meta(StatAgent::Claude, "p", false, at(-1, 1)), at(-1, 18) + 40 * 60_000, work(10 * MIN));
        let ist = |_: i64| 5 * HOUR_MS + 30 * 60_000;
        let v = summary(&b, &q(Period::Today, Metric::Time, RaceBy::Agents), D0 + 10 * HOUR_MS, &ist);
        assert_eq!(v.tiles.active_ms, 10 * MIN);
    }

    #[test]
    fn periods_sum_their_hours_and_compare_with_the_one_before() {
        let mut b = Book::default();
        let m = meta(StatAgent::Claude, "p", false, at(-20, 1));
        put(&mut b, "a", m.clone(), at(0, 1), tok(100));
        put(&mut b, "a", m.clone(), at(-3, 1), tok(50));
        put(&mut b, "a", m.clone(), at(-10, 1), tok(100));
        put(&mut b, "a", m, at(-40, 1), tok(1));
        let t = |p: Period| summary(&b, &q(p, Metric::Time, RaceBy::Agents), NOW, &utc).tiles;
        assert_eq!(t(Period::Today).tokens, 100);
        assert_eq!(t(Period::Week).tokens, 150);
        assert_eq!(t(Period::Week).tokens_change, Some(50.0));
        assert_eq!(t(Period::Today).tokens_change, None, "yesterday had nothing");
        assert_eq!(t(Period::All).tokens, 251);
        assert_eq!(t(Period::All).tokens_change, None);
    }

    #[test]
    fn the_podium_ranks_projects_by_the_chosen_metric() {
        let mut b = Book::default();
        put(&mut b, "a", meta(StatAgent::Claude, "alpha", false, at(0, 1)), at(0, 1), Cell { active_ms: 3 * H, input: 10, ..Cell::default() });
        put(&mut b, "b", meta(StatAgent::Codex, "beta", false, at(0, 1)), at(0, 2), Cell { active_ms: H, input: 900, ..Cell::default() });
        put(&mut b, "c", meta(StatAgent::Router, "beta", true, at(0, 1)), at(0, 2), work(H + 30 * MIN));
        let v = summary(&b, &week(), NOW, &utc);
        let names = |v: &StatsView| v.podium.iter().map(|p| (p.project.clone(), p.agent)).collect::<Vec<_>>();
        assert_eq!(names(&v), [("alpha".into(), StatAgent::Claude), ("beta".into(), StatAgent::Router)]);
        assert_eq!(v.podium[0].value, 3 * H);
        let v = summary(&b, &q(Period::Week, Metric::Tokens, RaceBy::Projects), NOW, &utc);
        assert_eq!(v.podium[0].project, "beta");
        assert_eq!(v.race.iter().map(|l| l.key.as_str()).collect::<Vec<_>>(), ["beta", "alpha"]);
    }

    #[test]
    fn tiles_count_sessions_subagents_cache_and_the_longest_session() {
        let mut b = Book::default();
        put(&mut b, "a", meta(StatAgent::Claude, "p", false, at(0, 1)), at(0, 1), Cell { active_ms: 2 * H, input: 10, cache_read: 30, questions: 2, ..Cell::default() });
        put(&mut b, "s", meta(StatAgent::Claude, "p", true, at(0, 1)), at(0, 1), work(5 * H));
        put(&mut b, "old", meta(StatAgent::Codex, "p", false, at(-30, 1)), at(0, 1), work(H));
        let t = summary(&b, &week(), NOW, &utc).tiles;
        assert_eq!((t.sessions, t.subagents, t.questions), (1, 1, 2));
        assert_eq!(t.cache_pct, Some(75.0));
        assert_eq!(t.cache_read, 30);
        assert_eq!(t.longest_ms, 2 * H, "a subagent is not a session");
        assert_eq!(t.active_ms, 8 * H);
    }

    #[test]
    fn the_agent_race_keeps_a_fixed_order_without_empty_lanes() {
        let mut b = Book::default();
        put(&mut b, "r", meta(StatAgent::Router, "p", true, at(0, 1)), at(0, 1), work(H));
        put(&mut b, "c", meta(StatAgent::Claude, "p", false, at(0, 1)), at(0, 1), work(MIN));
        let v = summary(&b, &week(), NOW, &utc);
        assert_eq!(v.race.iter().map(|l| (l.key.as_str(), l.agent)).collect::<Vec<_>>(),
            [("claude", Some(StatAgent::Claude)), ("router", Some(StatAgent::Router))]);
        put(&mut b, "o", meta(StatAgent::Opencode, "q", false, at(0, 1)), at(0, 1), work(2 * H));
        let v = summary(&b, &week(), NOW, &utc);
        assert_eq!(v.race.iter().map(|l| l.key.as_str()).collect::<Vec<_>>(), ["claude", "router", "opencode"]);
        assert_eq!(v.podium[0].agent, StatAgent::Opencode, "opencode pracował w projekcie najdłużej");
    }

    #[test]
    fn badges_have_thresholds() {
        let mut b = Book::default();
        put(&mut b, "a", meta(StatAgent::Claude, "small", false, at(0, 1)), at(0, 1), Cell { input: 1, cache_read: 999_998, ..Cell::default() });
        put(&mut b, "b", meta(StatAgent::Codex, "big", false, at(0, 1)), at(0, 2), Cell { input: 500_000, cache_read: 500_000, ..Cell::default() });
        put(&mut b, "s", meta(StatAgent::Claude, "big", true, at(0, 1)), at(0, 10), work(9 * H));
        put(&mut b, "c", meta(StatAgent::Claude, "night", false, at(-1, 1)), at(-1, 23), work(29 * MIN));
        let kinds = |v: &StatsView| v.badges.iter().map(|x| (format!("{:?}", x.kind), x.project.clone())).collect::<Vec<_>>();
        let v = summary(&b, &week(), NOW, &utc);
        assert_eq!(kinds(&v), [("Glutton".into(), Some("big".into())), ("CacheMaster".into(), Some("big".into())),
            ("Marathon".into(), Some("night".into()))]);
        put(&mut b, "c", meta(StatAgent::Claude, "night", false, at(-1, 1)), at(-1, 23), work(MIN));
        let v = summary(&b, &week(), NOW, &utc);
        assert!(v.badges.iter().any(|x| matches!(x.kind, BadgeKind::NightOwl)), "30 min after 23:00");
        let shifted = summary(&b, &week(), NOW, &|_| -5 * HOUR_MS);
        assert!(!shifted.badges.iter().any(|x| matches!(x.kind, BadgeKind::NightOwl)), "23:00 UTC is 18:00 at −5 h");
    }

    #[test]
    fn a_record_needs_an_earlier_day_and_an_hour_of_work() {
        let mut b = Book::default();
        let m = meta(StatAgent::Claude, "p", false, at(-1, 1));
        put(&mut b, "a", m.clone(), at(0, 1), work(5 * H));
        assert!(!summary(&b, &week(), NOW, &utc).record, "first day");
        let mut b = Book::default();
        put(&mut b, "a", m.clone(), at(-1, 1), work(90 * MIN));
        put(&mut b, "a", m.clone(), at(0, 1), work(2 * H));
        assert!(summary(&b, &week(), NOW, &utc).record);
        let mut b = Book::default();
        put(&mut b, "a", m.clone(), at(-1, 1), work(10 * MIN));
        put(&mut b, "a", m, at(0, 1), work(50 * MIN));
        assert!(!summary(&b, &week(), NOW, &utc).record, "under an hour");
    }

    #[test]
    fn the_calendar_ends_today_with_levels() {
        let mut b = Book::default();
        let m = meta(StatAgent::Claude, "p", false, at(-100, 1));
        for (d, ms) in [(-100, MIN), (-50, 10 * MIN), (-10, H), (0, 5 * H)] { put(&mut b, "a", m.clone(), at(d, 1), work(ms)); }
        let c = summary(&b, &week(), NOW, &utc).calendar;
        assert_eq!(c.len(), 182);
        assert_eq!(c.last().unwrap().date, "2026-09-27");
        assert_eq!(c.last().unwrap().level, 4);
        assert_eq!(c.iter().filter(|d| d.level > 0).count(), 4);
        assert!(c.iter().all(|d| d.level <= 4));
        assert_eq!(c.iter().find(|d| d.active_ms == MIN).unwrap().level, 1);
    }
}
