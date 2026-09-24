mod core;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn snapshot(state: tauri::State<core::Shared>) -> core::Snapshot {
    state.lock().unwrap().clone()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let shared: core::Shared = Default::default();
            app.manage(shared.clone());
            // Tymczasowe pływające okno sceny; osadzenie w pasku przychodzi w tasku 7.
            WebviewWindowBuilder::new(app, "stage0", WebviewUrl::App("index.html".into()))
                .title("agent-pets-stage").inner_size(400.0, 48.0).decorations(false)
                .transparent(true).always_on_top(true).skip_taskbar(true).resizable(false).shadow(false)
                .build()?;
            core::spawn(app.handle().clone(), shared, core::Mode::from_env());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![snapshot])
        .build(tauri::generate_context!())
        .expect("nie udało się zbudować aplikacji Tauri")
        .run(|_app, event| {
            // Okno sceny ginie razem z paskiem przy restarcie Explorera; aplikacja ma wtedy żyć dalej.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() { api.prevent_exit(); }
            }
        });
}
