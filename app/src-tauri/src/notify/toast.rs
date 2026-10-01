//! One toast, two backends: WinRT with a button on Windows, org.freedesktop.Notifications (D-Bus) on Linux.
//! `on` receives the activated action id (`Some(id)`, `None` for a plain dismissal or timeout).

/// Sound of a toast; only Windows plays one (a Linux notification daemon owns its own sounds).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Sound { Silent, Default, Reminder }

/// `false` when the system refused the toast, so the caller may try again.
#[cfg(windows)]
pub fn show(app_id: &str, title: &str, body: &str, button: Option<(&str, &str)>, sound: Sound,
            on: impl Fn(Option<String>) + Send + Sync + 'static) -> bool {
    use tauri_winrt_notification::{Sound as Win, Toast};
    let mut toast = Toast::new(app_id).title(title);
    if !body.is_empty() { toast = toast.text1(body); }
    if let Some((label, id)) = button { toast = toast.add_button(label, id); }
    toast = toast.sound(match sound { Sound::Silent => None, Sound::Default => Some(Win::Default), Sound::Reminder => Some(Win::Reminder) });
    toast.on_activated(move |action| { on(action); Ok(()) }).show()
        .map_err(|e| pets_core::app_log!("toast: {e}")).is_ok()
}

#[cfg(not(windows))]
pub fn show(_app_id: &str, title: &str, body: &str, button: Option<(&str, &str)>, _sound: Sound,
            on: impl Fn(Option<String>) + Send + Sync + 'static) -> bool {
    use notify_rust::{Notification, Timeout};
    let mut n = Notification::new();
    n.appname("Agent Pets").summary(title).body(body).timeout(Timeout::Milliseconds(6_000))
        .action("default", "default");
    if let Some((label, id)) = button { n.action(id, label); }
    match n.show() {
        Ok(handle) => {
            std::thread::spawn(move || {
                // blocks until an action is clicked, the notification closes, or it times out;
                // only a click invokes `on` (on Windows, dismissal fires no callback either)
                handle.wait_for_action(|a| match a {
                    "__closed" | "__timeout" => {}
                    other => on(Some(other.to_string())),
                });
            });
            true
        }
        Err(e) => { pets_core::app_log!("notification: {e}"); false }
    }
}
