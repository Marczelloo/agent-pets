mod core;
mod jump;
mod shell;
mod tooltip;
mod tray;

use tauri::{Manager, RunEvent};

#[tauri::command]
fn snapshot(state: tauri::State<core::Shared>) -> core::Snapshot {
    state.lock().unwrap().clone()
}

#[tauri::command]
fn stage_hello(app: tauri::AppHandle, shell: tauri::State<shell::Shell>, tip: tauri::State<tooltip::Tooltip>) {
    tip.hide(&app);
    shell.hello();
}

#[tauri::command]
fn stage_set_width(width: f64, shell: tauri::State<shell::Shell>) { shell.set_width(width); }

/// „Przejdź” do sesji. Rejestr Claude'a czytamy teraz, bo `hostSessionId` sesji desktopowej nie ma w migawce.
#[tauri::command]
fn jump(session_id: String, state: tauri::State<core::Shared>) -> jump::JumpResult {
    let snap = state.lock().unwrap().clone();
    let Some(s) = snap.sessions.iter().find(|s| s.id == session_id) else {
        return jump::JumpResult { method: "none".into(), detail: "Sesja już nie istnieje".into() };
    };
    let reg = std::env::var_os("USERPROFILE").and_then(|h| jump::registry::find(std::path::Path::new(&h), &session_id));
    jump::exec::run(&jump::plan(&jump::Target::from(s, reg.as_ref())))
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let shared: core::Shared = Default::default();
            app.manage(shared.clone());
            app.manage(shell::Shell::start(app.handle())?);
            app.manage(tooltip::Tooltip::default());
            tooltip::build(app.handle())?;
            tray::build(app.handle())?;
            core::spawn(app.handle().clone(), shared, core::Mode::from_env());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot, stage_hello, stage_set_width, jump,
            tooltip::tooltip_show, tooltip::tooltip_size, tooltip::tooltip_hide
        ])
        .build(tauri::generate_context!())
        .expect("nie udało się zbudować aplikacji Tauri")
        .run(|_app, event| {
            // Okno sceny ginie razem z paskiem przy restarcie Explorera; aplikacja ma wtedy żyć dalej.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() { api.prevent_exit(); }
            }
        });
}
