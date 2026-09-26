//! Aktualizacje z wydań na GitHubie (`tauri-plugin-updater`): sprawdzanie 15 s po starcie i co 6 h,
//! powiadomienie albo instalacja w spokojnym momencie (`pets_core::update_gate`). Podpis sprawdza wtyczka.
use pets_core::i18n::{tr, Lang};
use pets_core::settings::Updates;
use pets_core::update_gate::{busy, Calm};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const ENDPOINT: &str = "https://github.com/Marczelloo/agent-pets/releases/latest/download/latest.json";
const FIRST_CHECK: Duration = Duration::from_secs(15);
const EVERY: Duration = Duration::from_secs(6 * 3600);
const GATE_TICK: Duration = Duration::from_secs(5);

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum UpdateStatus {
    Idle,
    Checking,
    Latest,
    Available { version: String, notes: Option<String> },
    Downloading { version: String, pct: Option<u8> },
    /// pobrana i zweryfikowana, czeka na spokojny moment (tryb automatyczny)
    Ready { version: String },
    Error { message: String },
}

/// Tryb „powiadamiaj” zgłasza każdą wersję jeden raz (także po restarcie aplikacji).
pub fn should_notify(mode: Updates, notified: Option<&str>, version: &str) -> bool {
    mode == Updates::Notify && notified != Some(version)
}

/// Wersja do toastu „Zaktualizowano do …” po starcie; pierwsze uruchomienie w ogóle nie ma toastu.
pub fn updated_toast(seen: Option<&str>, current: &str) -> Option<String> {
    seen.filter(|s| *s != current).map(|_| current.to_string())
}

pub fn percent(done: u64, total: Option<u64>) -> Option<u8> {
    total.filter(|t| *t > 0).map(|t| ((done.min(t) * 100) / t) as u8)
}

/// Znaleziona aktualizacja i, po pobraniu, jej zweryfikowany instalator.
type Found = Option<(Update, Option<Vec<u8>>)>;

#[derive(Default)]
pub struct Updater {
    status: Mutex<Option<UpdateStatus>>,
    found: Mutex<Found>,
    /// jedno sprawdzanie albo pobieranie naraz
    working: AtomicBool,
}

/// Zwalnia `working` przy wyjściu z zakresu.
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> { fn drop(&mut self) { self.0.store(false, Ordering::Release); } }

impl Updater {
    pub fn status(&self) -> UpdateStatus { self.status.lock().unwrap().clone().unwrap_or(UpdateStatus::Idle) }
    fn take(&self) -> Option<Busy<'_>> { (!self.working.swap(true, Ordering::AcqRel)).then_some(Busy(&self.working)) }
    fn found(&self) -> Found { self.found.lock().unwrap().clone() }
    fn downloaded(&self) -> bool { matches!(&*self.found.lock().unwrap(), Some((_, Some(_)))) }
}

fn set(app: &AppHandle, s: UpdateStatus) {
    *app.state::<Updater>().status.lock().unwrap() = Some(s.clone());
    let _ = app.emit("pets://update", s);
}

fn lang(app: &AppHandle) -> Lang { app.state::<crate::settings::SettingsState>().lang() }
fn mode(app: &AppHandle) -> Updates { app.state::<crate::settings::SettingsState>().get().updates }

fn verify_failed(app: &AppHandle) -> String {
    tr(lang(app), "Nie udało się zweryfikować aktualizacji", "Could not verify the update").into()
}

/// Adres `latest.json`; `AGENT_PETS_UPDATE_URL` podmienia go do testów lokalnych (podpis i tak jest sprawdzany).
fn endpoint() -> String { std::env::var("AGENT_PETS_UPDATE_URL").unwrap_or_else(|_| ENDPOINT.into()) }

async fn find(app: &AppHandle) -> Result<Option<Update>, String> {
    let url = endpoint().parse().map_err(|e| format!("{e}"))?;
    let up = app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    up.check().await.map_err(|e| e.to_string())
}

/// Sprawdza wersję. `manual`: przycisk „Sprawdź teraz” (wynik zawsze widoczny, działa też przy `off`).
pub async fn check(app: &AppHandle, manual: bool) -> UpdateStatus {
    let u = app.state::<Updater>();
    {
        let Some(_busy) = u.take() else { return u.status() };
        if manual { set(app, UpdateStatus::Checking); }
        match find(app).await {
            Ok(None) => set(app, UpdateStatus::Latest),
            Ok(Some(up)) => {
                let version = up.version.clone();
                if matches!(u.found(), Some((f, Some(_))) if f.version == version) {
                    set(app, UpdateStatus::Ready { version });
                    return u.status();
                }
                set(app, UpdateStatus::Available { version: version.clone(), notes: up.body.clone() });
                *u.found.lock().unwrap() = Some((up.clone(), None));
                let home = app.state::<crate::settings::SettingsState>().home.clone();
                let mut st = crate::appstate::load(&home);
                if should_notify(mode(app), st.notified_version.as_deref(), &version) {
                    announce(app, &version, up.body.as_deref());
                    st.notified_version = Some(version);
                    let _ = crate::appstate::save(&home, &st);
                }
            }
            Err(e) => {
                eprintln!("agent-pets: sprawdzanie aktualizacji: {e}");
                if manual { set(app, UpdateStatus::Error { message: tr(lang(app), "Błąd sprawdzania aktualizacji", "Could not check for updates").into() }); }
            }
        }
    }
    if mode(app) == Updates::Auto && matches!(u.status(), UpdateStatus::Available { .. }) { download(app).await; }
    u.status()
}

/// Pobiera i weryfikuje instalator znalezionej wersji; zostaje w pamięci jako `Ready`.
async fn download(app: &AppHandle) -> bool {
    let u = app.state::<Updater>();
    let Some(_busy) = u.take() else { return u.downloaded() };
    let Some((up, None)) = u.found() else { return u.downloaded() };
    let version = up.version.clone();
    set(app, UpdateStatus::Downloading { version: version.clone(), pct: Some(0) });
    let (a, v) = (app.clone(), version.clone());
    let (mut got, mut last) = (0u64, Some(0u8));
    let r = up.download(move |chunk, total| {
        got += chunk as u64;
        let p = percent(got, total);
        if p != last { last = p; set(&a, UpdateStatus::Downloading { version: v.clone(), pct: p }); }
    }, || {}).await;
    match r {
        Ok(bytes) => {
            *u.found.lock().unwrap() = Some((up, Some(bytes)));
            set(app, UpdateStatus::Ready { version });
            true
        }
        Err(e) => {
            eprintln!("agent-pets: pobieranie aktualizacji: {e}");
            *u.found.lock().unwrap() = None;
            set(app, UpdateStatus::Error { message: verify_failed(app) });
            false
        }
    }
}

/// Instaluje znalezioną wersję (najpierw ją pobiera, jeśli trzeba). Aplikacja kończy się, a instalator ją uruchamia.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let u = app.state::<Updater>();
    if u.found().is_none() { check(app, true).await; }
    if !u.downloaded() && !download(app).await { return Err(verify_failed(app)); }
    let Some((up, Some(bytes))) = u.found() else { return Err(verify_failed(app)) };
    up.install(bytes).map_err(|e| { eprintln!("agent-pets: instalacja aktualizacji: {e}"); verify_failed(app) })
}

fn announce(app: &AppHandle, version: &str, notes: Option<&str>) {
    let l = lang(app);
    let title = format!("{} {version}", tr(l, "Dostępna wersja", "Version available:"));
    let body = notes.and_then(|n| n.lines().map(str::trim).find(|x| !x.is_empty())).unwrap_or("").to_string();
    let a = app.clone();
    crate::notify::show_update(app, &title, &body, Some(tr(l, "Zainstaluj", "Install")), move |action| {
        if action.as_deref() == Some("install") {
            let a2 = a.clone();
            tauri::async_runtime::spawn(async move { let _ = install(&a2).await; });
        } else {
            crate::panel::open(&a, None);
        }
    });
}

/// Czy użytkownik ma otwarty panel albo ustawienia (wtedy nie przerywamy mu instalacją).
fn ui_open(app: &AppHandle) -> bool {
    ["panel", "settings"].iter().any(|l| app.get_webview_window(l).and_then(|w| w.is_visible().ok()).unwrap_or(false))
}

/// Wątek harmonogramu: toast po aktualizacji, pierwsze sprawdzenie po 15 s, potem co 6 h; w trybie
/// automatycznym co 5 s brama spokojnego momentu dla pobranej wersji.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        greet_after_update(&app);
        std::thread::sleep(FIRST_CHECK);
        let mut next = Instant::now();
        let mut calm = Calm::default();
        loop {
            if Instant::now() >= next {
                if mode(&app) != Updates::Off { tauri::async_runtime::block_on(check(&app, false)); }
                next = Instant::now() + EVERY;
            }
            let ready = matches!(app.state::<Updater>().status(), UpdateStatus::Ready { .. });
            if ready && mode(&app) == Updates::Auto {
                let states: Vec<_> = app.state::<crate::core::Shared>().lock().unwrap().sessions.iter().map(|s| s.state).collect();
                let b = busy(&states, crate::shell::fullscreen_app(), ui_open(&app));
                if calm.observe(b, pets_core::time::now_ms()) {
                    if let Err(e) = tauri::async_runtime::block_on(install(&app)) { eprintln!("agent-pets: {e}"); }
                    calm = Calm::default();
                }
            } else {
                calm = Calm::default();
            }
            std::thread::sleep(GATE_TICK);
        }
    });
}

fn greet_after_update(app: &AppHandle) {
    let home = app.state::<crate::settings::SettingsState>().home.clone();
    let mut st = crate::appstate::load(&home);
    let current = app.package_info().version.to_string();
    if let Some(v) = updated_toast(st.seen_version.as_deref(), &current) {
        let title = format!("{} {v}", tr(lang(app), "Zaktualizowano do wersji", "Updated to version"));
        crate::notify::show_update(app, &title, "", None, |_| {});
    }
    if st.seen_version.as_deref() != Some(current.as_str()) {
        st.seen_version = Some(current);
        let _ = crate::appstate::save(&home, &st);
    }
}

#[tauri::command]
pub fn update_status(u: tauri::State<Updater>) -> UpdateStatus { u.status() }

#[tauri::command]
pub async fn update_check(app: AppHandle) -> UpdateStatus { check(&app, true).await }

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> { install(&app).await }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notify_mode_announces_each_version_once() {
        assert!(should_notify(Updates::Notify, None, "0.7.1"));
        assert!(should_notify(Updates::Notify, Some("0.7.0"), "0.7.1"));
        assert!(!should_notify(Updates::Notify, Some("0.7.1"), "0.7.1"));
        assert!(!should_notify(Updates::Auto, None, "0.7.1"));
        assert!(!should_notify(Updates::Off, None, "0.7.1"));
    }

    #[test]
    fn the_updated_toast_shows_after_a_version_change_but_not_on_the_first_run() {
        assert_eq!(updated_toast(Some("0.7.0"), "0.7.1"), Some("0.7.1".to_string()));
        assert_eq!(updated_toast(Some("0.7.1"), "0.7.1"), None);
        assert_eq!(updated_toast(None, "0.7.1"), None);
    }

    #[test]
    fn status_serializes_for_the_ui() {
        let v = serde_json::to_value(UpdateStatus::Available { version: "0.7.1".into(), notes: None }).unwrap();
        assert_eq!(v, serde_json::json!({ "state": "available", "version": "0.7.1", "notes": null }));
        assert_eq!(serde_json::to_value(UpdateStatus::Latest).unwrap(), serde_json::json!({ "state": "latest" }));
        let d = serde_json::to_value(UpdateStatus::Downloading { version: "0.7.1".into(), pct: Some(40) }).unwrap();
        assert_eq!(d["pct"], 40);
    }

    #[test]
    fn download_percent_is_bounded_and_unknown_without_a_length() {
        assert_eq!(percent(50, Some(200)), Some(25));
        assert_eq!(percent(500, Some(200)), Some(100));
        assert_eq!(percent(10, None), None);
        assert_eq!(percent(10, Some(0)), None);
    }
}
