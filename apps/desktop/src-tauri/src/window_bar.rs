use tauri::utils::config::WindowConfig;
use tauri::{Manager, WebviewWindow};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    State,
    Drag,
    Minimize,
    ToggleMaximize,
    Close,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    Windows,
    MacOs,
    Other,
}

impl Platform {
    pub fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::MacOs
        } else {
            Self::Other
        }
    }

    fn name(self) -> Option<&'static str> {
        match self {
            Self::Windows => Some("windows"),
            Self::MacOs => Some("macos"),
            Self::Other => None,
        }
    }
}

// WHY: tauri.production.conf.json replaces the whole `app.windows` array, so a platform overlay file cannot carry the frame.
pub fn configure_frame(config: &mut WindowConfig, platform: Platform) {
    match platform {
        Platform::Windows => {
            config.decorations = false;
            // `shadow: true` draws a 1px border on an undecorated window (tauri-utils config.rs, `WindowConfig::shadow`).
            config.shadow = false;
        }
        Platform::MacOs => {
            config.title_bar_style = tauri::utils::TitleBarStyle::Overlay;
            config.hidden_title = true;
        }
        Platform::Other => {}
    }
}

// The web app draws the bar only when the shell defines this value, so an older shell with a native title bar never gets a second bar.
pub fn initialization_script(origin: &tauri::Url, platform: Platform) -> String {
    let Some(name) = platform.name() else {
        return String::new();
    };
    format!(
        "if (window.top === window && window.location.origin === {}) {{ Object.defineProperty(window, '__ORBIT_DESKTOP_WINDOW_BAR__', {{ value: {} }}); }}",
        serde_json::to_string(&origin.origin().ascii_serialization()).unwrap(),
        serde_json::to_string(name).unwrap(),
    )
}

#[tauri::command]
pub fn desktop_window(window: WebviewWindow, action: Action) -> Result<bool, String> {
    let tauri::utils::config::WebviewUrl::External(origin) = &window.config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    let current = window.url().map_err(|error| error.to_string())?;
    if !crate::command_origin::allows(window.label(), &current, origin) {
        return Err("Desktop window origin rejected".into());
    }
    apply(&window, action).map_err(|error| error.to_string())
}

trait BarWindow {
    fn is_maximized(&self) -> tauri::Result<bool>;
    fn maximize(&self) -> tauri::Result<()>;
    fn unmaximize(&self) -> tauri::Result<()>;
    fn minimize(&self) -> tauri::Result<()>;
    fn start_dragging(&self) -> tauri::Result<()>;
    fn close(&self) -> tauri::Result<()>;
}

impl BarWindow for WebviewWindow {
    fn is_maximized(&self) -> tauri::Result<bool> {
        WebviewWindow::is_maximized(self)
    }
    fn maximize(&self) -> tauri::Result<()> {
        WebviewWindow::maximize(self)
    }
    fn unmaximize(&self) -> tauri::Result<()> {
        WebviewWindow::unmaximize(self)
    }
    fn minimize(&self) -> tauri::Result<()> {
        WebviewWindow::minimize(self)
    }
    fn start_dragging(&self) -> tauri::Result<()> {
        WebviewWindow::start_dragging(self)
    }
    fn close(&self) -> tauri::Result<()> {
        WebviewWindow::close(self)
    }
}

fn apply(window: &impl BarWindow, action: Action) -> tauri::Result<bool> {
    match action {
        Action::State => {}
        Action::Drag => window.start_dragging()?,
        Action::Minimize => window.minimize()?,
        Action::Close => window.close()?,
        Action::ToggleMaximize => {
            if window.is_maximized()? {
                window.unmaximize()?
            } else {
                window.maximize()?
            }
        }
    }
    window.is_maximized()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    #[test]
    fn windows_has_no_native_frame_and_no_border_line() {
        let mut config = crate::context().config().app.windows[0].clone();
        assert!(config.decorations);
        configure_frame(&mut config, Platform::Windows);
        assert!(!config.decorations);
        assert!(!config.shadow);
        assert!(config.resizable);
    }

    #[test]
    fn macos_hides_the_title_strip_and_keeps_the_traffic_lights() {
        let mut config = crate::context().config().app.windows[0].clone();
        configure_frame(&mut config, Platform::MacOs);
        assert!(config.decorations);
        assert_eq!(config.title_bar_style, tauri::utils::TitleBarStyle::Overlay);
        assert!(config.hidden_title);
    }

    #[test]
    fn other_platforms_keep_their_frame() {
        let mut config = crate::context().config().app.windows[0].clone();
        let before = config.clone();
        configure_frame(&mut config, Platform::Other);
        assert_eq!(config, before);
    }

    #[test]
    fn the_main_window_is_created_with_the_frame_of_its_platform() {
        let config = crate::context().config().app.windows[0].clone();
        crate::lifecycle::create_main(
            config,
            false,
            None,
            |config| {
                assert_eq!(config.decorations, !cfg!(windows));
                assert_eq!(config.hidden_title, cfg!(target_os = "macos"));
                Ok(())
            },
            || Ok(()),
        )
        .unwrap();
    }

    #[test]
    fn the_page_flag_exists_only_on_the_environment_origin_and_a_custom_frame() {
        let origin: tauri::Url = "https://app.useorbit.org/".parse().unwrap();
        let windows = initialization_script(&origin, Platform::Windows);
        assert!(windows.contains("window.top === window"));
        assert!(windows.contains("window.location.origin === \"https://app.useorbit.org\""));
        assert!(windows.contains("'__ORBIT_DESKTOP_WINDOW_BAR__', { value: \"windows\" }"));
        assert!(initialization_script(&origin, Platform::MacOs).contains("value: \"macos\""));
        assert_eq!(initialization_script(&origin, Platform::Other), "");
    }

    #[test]
    fn actions_deserialize_from_the_names_the_page_sends() {
        for (name, action) in [
            ("state", Action::State),
            ("drag", Action::Drag),
            ("minimize", Action::Minimize),
            ("toggle_maximize", Action::ToggleMaximize),
            ("close", Action::Close),
        ] {
            let parsed: Action = serde_json::from_str(&format!("\"{name}\"")).unwrap();
            assert_eq!(parsed, action);
        }
        assert!(serde_json::from_str::<Action>("\"destroy\"").is_err());
    }

    struct Recorder {
        maximized: Cell<bool>,
        calls: RefCell<Vec<&'static str>>,
    }

    impl Recorder {
        fn new(maximized: bool) -> Self {
            Self {
                maximized: Cell::new(maximized),
                calls: RefCell::new(Vec::new()),
            }
        }
        fn record(&self, call: &'static str) -> tauri::Result<()> {
            self.calls.borrow_mut().push(call);
            Ok(())
        }
    }

    impl BarWindow for Recorder {
        fn is_maximized(&self) -> tauri::Result<bool> {
            Ok(self.maximized.get())
        }
        fn maximize(&self) -> tauri::Result<()> {
            self.maximized.set(true);
            self.record("maximize")
        }
        fn unmaximize(&self) -> tauri::Result<()> {
            self.maximized.set(false);
            self.record("unmaximize")
        }
        fn minimize(&self) -> tauri::Result<()> {
            self.record("minimize")
        }
        fn start_dragging(&self) -> tauri::Result<()> {
            self.record("start_dragging")
        }
        fn close(&self) -> tauri::Result<()> {
            self.record("close")
        }
    }

    #[test]
    fn each_action_calls_its_window_command_and_reports_the_maximized_state() {
        for (action, maximized, call, after) in [
            (Action::State, false, None, false),
            (Action::State, true, None, true),
            (Action::Drag, false, Some("start_dragging"), false),
            (Action::Minimize, false, Some("minimize"), false),
            (Action::Close, false, Some("close"), false),
            (Action::ToggleMaximize, false, Some("maximize"), true),
            (Action::ToggleMaximize, true, Some("unmaximize"), false),
        ] {
            let window = Recorder::new(maximized);
            assert_eq!(apply(&window, action).unwrap(), after);
            assert_eq!(window.calls.borrow().as_slice(), call.as_slice());
        }
    }
}
