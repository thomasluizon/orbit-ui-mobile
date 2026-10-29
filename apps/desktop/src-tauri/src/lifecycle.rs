use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

trait DesktopHost {
    fn show(&self) -> tauri::Result<()>;
    fn unminimize(&self) -> tauri::Result<()>;
    fn focus(&self) -> tauri::Result<()>;
    fn hide(&self) -> tauri::Result<()>;
    fn save_geometry(&self);
    fn exit(&self);
}

impl DesktopHost for AppHandle {
    fn show(&self) -> tauri::Result<()> {
        main_window(self)?.show()
    }
    fn unminimize(&self) -> tauri::Result<()> {
        main_window(self)?.unminimize()
    }
    fn focus(&self) -> tauri::Result<()> {
        main_window(self)?.set_focus()
    }
    fn hide(&self) -> tauri::Result<()> {
        main_window(self)?.hide()
    }
    fn save_geometry(&self) {
        save_window(self);
    }
    fn exit(&self) {
        self.exit(0);
    }
}

fn main_window(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    app.get_webview_window("main").ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Desktop window is unavailable",
        )
        .into()
    })
}

fn restore(host: &impl DesktopHost) -> tauri::Result<()> {
    host.show()?;
    host.unminimize()?;
    host.focus()
}

pub fn create_main(
    mut config: tauri::utils::config::WindowConfig,
    notification_launch: bool,
    build: impl FnOnce(&tauri::utils::config::WindowConfig) -> tauri::Result<()>,
    show: impl FnOnce() -> tauri::Result<()>,
) -> tauri::Result<()> {
    config.visible = false;
    config.focus = false;
    build(&config)?;
    if !notification_launch {
        show()?;
    }
    Ok(())
}

fn hide_to_tray(host: &impl DesktopHost) -> tauri::Result<()> {
    host.save_geometry();
    host.hide()
}

fn quit(host: &impl DesktopHost) {
    host.save_geometry();
    host.exit();
}

pub fn show_main(app: &AppHandle) -> tauri::Result<()> {
    restore(app)?;
    crate::updates::show_prompt(app);
    Ok(())
}

pub fn quit_app(app: &AppHandle) {
    quit(app);
}

pub fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if window.label() == "main" {
        if let WindowEvent::Focused(true) = event {
            crate::updates::check(window.app_handle());
            crate::updates::show_prompt(window.app_handle());
        }
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(error) = hide_to_tray(window.app_handle()) {
                eprintln!("Cannot hide desktop window: {error}");
            }
        }
    }
}

pub fn save_window(app: &AppHandle) {
    if let Err(error) = app.save_window_state(window_state_flags()) {
        eprintln!("Cannot save desktop window: {error}");
    }
}

pub fn open_palette(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    show_main(app)?;
    if let Some(window) = app.get_webview_window("main") {
        let tauri::utils::config::WebviewUrl::External(origin) = &app.config().app.windows[0].url
        else {
            return Err("Desktop requires a deployed origin".into());
        };
        if window.url()?.origin() == origin.origin() {
            window.eval(include_str!("palette.js"))?;
        }
    }
    Ok(())
}

pub fn navigate(app: &AppHandle, path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let tauri::utils::config::WebviewUrl::External(origin) = &app.config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    show_main(app)?;
    if let Some(window) = app.get_webview_window("main") {
        window.navigate(origin.join(path)?)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct Host {
        visible: Cell<bool>,
        minimized: Cell<bool>,
        focused: Cell<bool>,
        running: Cell<bool>,
        saved: Cell<bool>,
        fail_show: bool,
    }

    impl Host {
        fn hidden() -> Self {
            Self {
                visible: Cell::new(false),
                minimized: Cell::new(true),
                focused: Cell::new(false),
                running: Cell::new(true),
                saved: Cell::new(false),
                fail_show: false,
            }
        }
    }

    impl DesktopHost for Host {
        fn show(&self) -> tauri::Result<()> {
            if self.fail_show {
                return Err(std::io::Error::other("Cannot show window").into());
            }
            self.visible.set(true);
            Ok(())
        }
        fn unminimize(&self) -> tauri::Result<()> {
            self.minimized.set(false);
            Ok(())
        }
        fn focus(&self) -> tauri::Result<()> {
            assert!(self.visible.get());
            assert!(!self.minimized.get());
            self.focused.set(true);
            Ok(())
        }
        fn hide(&self) -> tauri::Result<()> {
            assert!(self.saved.get());
            self.visible.set(false);
            Ok(())
        }
        fn save_geometry(&self) {
            self.saved.set(true);
        }
        fn exit(&self) {
            assert!(self.saved.get());
            self.running.set(false);
        }
    }

    #[test]
    fn reopening_a_hidden_minimized_window_makes_it_usable() {
        let host = Host::hidden();
        restore(&host).unwrap();
        assert!(host.visible.get());
        assert!(!host.minimized.get());
        assert!(host.focused.get());
        assert!(host.running.get());
    }

    #[test]
    fn a_failed_restore_is_reported_without_focusing_an_invisible_window() {
        let host = Host {
            fail_show: true,
            ..Host::hidden()
        };
        assert!(restore(&host).is_err());
        assert!(!host.focused.get());
        assert!(host.running.get());
    }

    #[test]
    fn closing_keeps_the_process_alive_and_quit_really_exits() {
        let host = Host::hidden();
        restore(&host).unwrap();
        hide_to_tray(&host).unwrap();
        assert!(!host.visible.get());
        assert!(host.running.get());
        assert!(host.saved.get());
        restore(&host).unwrap();
        assert!(host.visible.get());
        host.saved.set(false);
        quit(&host);
        assert!(!host.running.get());
        assert!(host.saved.get());
    }

    #[test]
    fn geometry_is_remembered_without_restoring_a_hidden_or_minimized_window() {
        let flags = window_state_flags();
        assert!(flags.contains(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED));
        assert!(flags.contains(StateFlags::FULLSCREEN));
        assert!(!flags.contains(StateFlags::VISIBLE));
        assert!(!flags.contains(StateFlags::DECORATIONS));
    }

    #[test]
    fn cold_notification_launch_stays_hidden_through_creation_and_session_restoration() {
        assert_cold_notification_launch(false);
        assert_cold_notification_launch(true);
    }

    fn assert_cold_notification_launch(windows: bool) {
        use crate::{
            push_action,
            push_state::{PushSession, PushState},
        };

        for (done, accepted, response_before_creation) in [
            (true, true, true),
            (true, true, false),
            (true, false, true),
            (true, false, false),
            (false, true, true),
            (false, true, false),
            (false, false, true),
            (false, false, false),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let mut saved = PushState::load(&directory.path().join("push.json")).unwrap();
            saved.owner = Some("account-a".into());
            let mut session = PushSession::default();
            let payload = r#"{"body":{"habitId":"11111111-1111-4111-8111-111111111111","doneToken":"one-use-token","url":"/"}}"#;
            let response = |session: &mut PushSession| {
                if windows {
                    let Some(push_action::Response::Done(reminder)) =
                        push_action::apns_response(payload, true)
                    else {
                        panic!("repeat payload must carry a reminder");
                    };
                    let notice = push_action::WindowsNotice {
                        owner: "account-a".into(),
                        reminder,
                    };
                    session.windows_response(&saved, &serde_json::to_string(&notice).unwrap(), done)
                } else {
                    session.response(&saved, payload, done)
                }
            };
            if response_before_creation {
                assert_eq!(response(&mut session), None);
            }
            let host = Host::hidden();
            let config = super::super::context().config().app.windows[0].clone();
            create_main(
                config,
                true,
                |config| {
                    host.visible.set(config.visible);
                    host.focused.set(config.focus && config.visible);
                    Ok(())
                },
                || restore(&host),
            )
            .unwrap();
            assert!(
                !host.visible.get(),
                "notification startup showed the window"
            );
            assert!(!host.focused.get());
            if !response_before_creation {
                assert_eq!(response(&mut session), None);
            }
            assert_eq!(session.restore(None, &saved), None);
            assert!(!host.visible.get());
            let response = session.restore(Some("account-a".into()), &saved).unwrap();
            let mut posts = Vec::new();
            let destination =
                tauri::async_runtime::block_on(push_action::resolve(response, |token| {
                    posts.push(token);
                    async { accepted }
                }));
            if let Some(destination) = destination {
                assert_eq!(
                    destination.as_deref(),
                    Some("/habits/11111111-1111-4111-8111-111111111111")
                );
                restore(&host).unwrap();
            }
            assert_eq!(posts.len(), usize::from(done));
            assert_eq!(host.visible.get(), !done || !accepted);
            assert_eq!(host.focused.get(), !done || !accepted);
            assert_eq!(session.restore(Some("account-a".into()), &saved), None);
        }
    }

    #[test]
    fn ordinary_launch_creates_and_restores_the_main_window() {
        let host = Host::hidden();
        let config = super::super::context().config().app.windows[0].clone();
        create_main(
            config,
            false,
            |config| {
                host.visible.set(config.visible);
                Ok(())
            },
            || restore(&host),
        )
        .unwrap();
        assert!(host.visible.get());
        assert!(host.focused.get());
        assert!(!host.minimized.get());
    }
}
