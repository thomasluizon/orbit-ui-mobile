use crate::locks::RecoverLock;
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
    let Color(red, green, blue, _) = config.background_color.expect("launch canvas configured");
    let png: &'static [u8] = if config.background_color == Some(canvas(true)) {
        include_bytes!("../native/launch-dark.png")
    } else {
        include_bytes!("../native/launch-light.png")
    };
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
pub fn desktop_launch(window: WebviewWindow, generation: Option<u64>) -> Result<u64, String> {
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
        set_visible(&window, false).map_err(|error| error.to_string())?;
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

pub fn configure(config: &mut WindowConfig) {
    let dark = config
        .theme
        .map_or_else(system_is_dark, |theme| theme == Theme::Dark);
    config.background_color = Some(canvas(dark));
}

fn system_is_dark() -> bool {
    unsafe { orbit_launch_is_dark() }
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
