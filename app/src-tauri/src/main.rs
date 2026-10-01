// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // X11 via XWayland, forced: precise stage positioning (`gtk move()` is ignored on Wayland, and
        // desktop sessions export GDK_BACKEND=wayland).
        std::env::set_var("GDK_BACKEND", "x11");
        // webkit's DMABUF renderer composites on a separate Wayland surface that keeps a stale
        // position after the window moves: the pet was drawn away from its X window, and pointer
        // coordinates (from the compositor) never matched what the user saw. Classic renderer off.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        // resolve the Hyprland socket while still single-threaded (threads must not getenv, see taskbar_linux)
        agent_pets_lib::init_hyprland_socket();
    }
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = agent_pets_lib::uninstall_cli(&args) { std::process::exit(code); }
    agent_pets_lib::run()
}
