use crate::locks::RecoverLock;
use crate::settings::{DesktopSettings, LaunchMode};
use tauri::utils::config::{Color, WindowConfig};
use tauri::Theme;
use tauri::{Manager, WebviewWindow};

#[derive(Default)]
pub struct LaunchState(std::sync::Mutex<u64>);

pub fn initialization_script(origin: &tauri::Url) -> String {
    include_str!("launch.js").replace(
        "__ORBIT_LAUNCH_ORIGIN__",
        &serde_json::to_string(&origin.origin().ascii_serialization()).unwrap(),
    )
}

pub fn install(window: &WebviewWindow, config: &WindowConfig) -> tauri::Result<()> {
    install_canvas(
        window,
        config.background_color.expect("launch canvas configured"),
    )
}

fn mark(color: Color) -> &'static [u8] {
    if color == canvas(true) {
        include_bytes!("../native/launch-dark.png")
    } else {
        include_bytes!("../native/launch-light.png")
    }
}

fn install_canvas(window: &WebviewWindow, color: Color) -> tauri::Result<()> {
    let Color(red, green, blue, _) = color;
    let png = mark(color);
    let (sent, received) = std::sync::mpsc::sync_channel(1);
    with_native(window, move |pointer| {
        let installed =
            unsafe { orbit_launch_install(pointer, png.as_ptr(), png.len(), red, green, blue) };
        let _ = sent.send(installed);
    })?;
    if !received.recv().map_err(std::io::Error::other)? {
        return Err(std::io::Error::other("Cannot create desktop launch surface").into());
    }
    Ok(())
}

pub fn page_loading(window: &WebviewWindow, event: tauri::webview::PageLoadEvent) {
    if matches!(event, tauri::webview::PageLoadEvent::Started) {
        let state = window.state::<LaunchState>();
        let mut generation = state.0.recover_lock();
        *generation = generation.wrapping_add(1);
        if let Err(error) = set_visible(window, true) {
            eprintln!("Cannot show desktop launch surface: {error}");
        }
    }
}

#[tauri::command]
pub fn desktop_launch(
    window: WebviewWindow,
    generation: Option<u64>,
    mode: Option<String>,
    reveal: Option<bool>,
) -> Result<u64, String> {
    let tauri::utils::config::WebviewUrl::External(origin) = &window.config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    let current = window.url().map_err(|error| error.to_string())?;
    if !crate::command_origin::allows(window.label(), &current, origin) {
        return Err("Desktop launch origin rejected".into());
    }
    let state = window.state::<LaunchState>();
    let current_generation = state.0.recover_lock();
    if generation == Some(*current_generation) {
        let settings = window.state::<std::sync::Mutex<DesktopSettings>>();
        settings.recover_lock().report_launch_mode(
            mode.as_deref(),
            &crate::settings::path(window.app_handle()).map_err(|error| error.to_string())?,
            |mode| {
                let dark = mode == LaunchMode::Dark;
                let color = canvas(dark);
                window
                    .set_theme(Some(theme(dark)))
                    .map_err(|error| error.to_string())?;
                window
                    .set_background_color(Some(color))
                    .map_err(|error| error.to_string())?;
                install_canvas(&window, color).map_err(|error| error.to_string())
            },
        )?;
        if reveal != Some(false) {
            set_visible(&window, false).map_err(|error| error.to_string())?;
        }
    }
    Ok(*current_generation)
}

fn set_visible(window: &WebviewWindow, visible: bool) -> tauri::Result<()> {
    with_native(window, move |pointer| unsafe {
        orbit_launch_set_visible(pointer, visible)
    })
}

fn with_native(
    window: &WebviewWindow,
    callback: impl FnOnce(*mut std::ffi::c_void) + Send + 'static,
) -> tauri::Result<()> {
    #[cfg(windows)]
    let pointer = window.hwnd()?.0 as usize;
    window.with_webview(move |_native| {
        #[cfg(target_os = "macos")]
        let pointer = _native.inner();
        #[cfg(windows)]
        let pointer = pointer as *mut std::ffi::c_void;
        callback(pointer);
    })
}

pub fn configure(config: &mut WindowConfig, mode: Option<LaunchMode>) {
    let dark = mode.map_or_else(
        || {
            config
                .theme
                .map_or_else(system_is_dark, |theme| theme == Theme::Dark)
        },
        |mode| mode == LaunchMode::Dark,
    );
    config.background_color = Some(canvas(dark));
    config.theme = Some(theme(dark));
}

fn system_is_dark() -> bool {
    unsafe { orbit_launch_is_dark() }
}

// The native caption, menu bar and webview colour scheme follow the page's mode, not the system's (#2084).
fn theme(dark: bool) -> Theme {
    if dark {
        Theme::Dark
    } else {
        Theme::Light
    }
}

pub fn canvas(dark: bool) -> Color {
    if dark {
        Color(9, 9, 11, 255)
    } else {
        Color(250, 250, 250, 255)
    }
}

extern "C" {
    fn orbit_launch_is_dark() -> bool;
    fn orbit_launch_install(
        window: *mut std::ffi::c_void,
        png: *const u8,
        length: usize,
        red: u8,
        green: u8,
        blue: u8,
    ) -> bool;
    fn orbit_launch_set_visible(window: *mut std::ffi::c_void, visible: bool);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_latest_page_mode_overrides_the_system_canvas_and_mark_before_window_creation() {
        for (mode, reported, system, window_theme, expected, png) in [
            (
                LaunchMode::Dark,
                "dark",
                Theme::Light,
                Theme::Dark,
                canvas(true),
                include_bytes!("../native/launch-dark.png").as_slice(),
            ),
            (
                LaunchMode::Light,
                "light",
                Theme::Dark,
                Theme::Light,
                canvas(false),
                include_bytes!("../native/launch-light.png").as_slice(),
            ),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("settings.json");
            let mut settings = DesktopSettings::load(&path).unwrap();
            settings
                .report_launch_mode(
                    Some(if reported == "dark" { "light" } else { "dark" }),
                    &path,
                    |_| Ok(()),
                )
                .unwrap();
            settings
                .report_launch_mode(Some(reported), &path, |_| Ok(()))
                .unwrap();
            let restored = DesktopSettings::load(&path).unwrap();
            assert_eq!(restored.launch_mode, Some(mode));
            let mut config = crate::context().config().app.windows[0].clone();
            config.theme = Some(system);
            crate::lifecycle::create_main(
                config,
                false,
                restored.launch_mode,
                |config| {
                    assert_eq!(config.background_color, Some(expected));
                    assert_eq!(config.theme, Some(window_theme));
                    assert_eq!(mark(config.background_color.unwrap()), png);
                    assert!(!config.visible);
                    Ok(())
                },
                || Ok(()),
            )
            .unwrap();
        }
    }

    #[test]
    fn the_first_launch_without_a_saved_mode_uses_the_system_canvas_and_mark() {
        let directory = tempfile::tempdir().unwrap();
        let settings = DesktopSettings::load(&directory.path().join("settings.json")).unwrap();
        assert_eq!(settings.launch_mode, None);
        for (system, expected) in [(Theme::Dark, canvas(true)), (Theme::Light, canvas(false))] {
            let mut config = crate::context().config().app.windows[0].clone();
            config.theme = Some(system);
            configure(&mut config, settings.launch_mode);
            assert_eq!(config.background_color, Some(expected));
            assert_eq!(
                mark(expected),
                if system == Theme::Dark {
                    include_bytes!("../native/launch-dark.png").as_slice()
                } else {
                    include_bytes!("../native/launch-light.png").as_slice()
                }
            );
        }
    }
}
