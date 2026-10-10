// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // X11 via XWayland, forced: precise stage positioning (`gtk move()` is ignored on Wayland, and
        // desktop sessions export GDK_BACKEND=wayland).
        std::env::set_var("GDK_BACKEND", "x11");
        // webkit's DMABUF renderer stays on: without it (shared-memory path) transparent windows keep
        // the previous frames, so animated pets and moving bubbles left trails. Off only on the NVIDIA
        // proprietary driver, where it gives blank windows. Left to the user when already set.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
            && std::path::Path::new("/proc/driver/nvidia/version").exists()
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        // resolve the Hyprland socket while still single-threaded (threads must not getenv, see taskbar_linux)
        agent_pets_lib::init_hyprland_socket();
    }
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = agent_pets_lib::uninstall_cli(&args) { std::process::exit(code); }
    agent_pets_lib::run()
}
