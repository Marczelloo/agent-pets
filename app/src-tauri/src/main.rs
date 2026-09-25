// Bez okna konsoli w wydaniu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = agent_pets_lib::uninstall_cli(&args) { std::process::exit(code); }
    agent_pets_lib::run()
}
