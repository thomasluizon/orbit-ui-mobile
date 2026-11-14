use crate::locks::RecoverLock;
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
    Menu,
    Bar,
}

// CSS pixels of the bar, matching apps/web/lib/desktop-window.ts: the menu action starts at the end inset, so its popup opens
// at that inset under the bar.
const BAR_HEIGHT: f64 = 48.0;
const BAR_END_INSET: f64 = 4.0;

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
            // tao `inset_traffic_lights` (view.rs) sets the button row height to the button height plus `y`, so 17 centres the 14px buttons in the 48px bar.
            config.traffic_light_position =
                Some(tauri::utils::config::LogicalPosition { x: 16.0, y: 17.0 });
            // wry `acceptsFirstMouse:` (wkwebview/class/wry_web_view.rs) returns this. So the first press on an inactive
            // window reaches the drag area of the bar and drags the window, as the native title bar does.
            config.accept_first_mouse = true;
        }
        Platform::Other => {}
    }
}

// The page draws the bar only when this attribute exists, so an older shell with a native title bar never gets a second bar.
// The script marks the root element at document creation, so the page reserves the bar's space from the first painted frame.
pub fn initialization_script(origin: &tauri::Url, platform: Platform) -> String {
    let Some(name) = platform.name() else {
        return String::new();
    };
    format!(
        "if (window.top === window && window.location.origin === {}) {{ const mark = () => document.documentElement.setAttribute('data-desktop-window-bar', {}); if (document.documentElement) mark(); else new MutationObserver((_, observer) => {{ if (document.documentElement) {{ mark(); observer.disconnect(); }} }}).observe(document, {{ childList: true }}); }}",
        serde_json::to_string(&origin.origin().ascii_serialization()).unwrap(),
        serde_json::to_string(name).unwrap(),
    )
}

// The window keeps its own frame (no native frame on Windows, the overlay title bar on macOS) only while the page draws the
// bar over it. A document that never draws one (the error page of a failed or offline load, a web build that predates the
// bar) gets the native frame back after the same 15 seconds that the launch cover gives a page to paint
// (native/windows/launch.cpp `SetTimer`, native/macos/launch.m `deadline`, src/launch.js). On Windows the deadline of a
// load starts when it finishes: wry reports a failed main-frame load as `Finished` too (wry webview2
// `add_NavigationCompleted` drops `IsSuccess`). On macOS wry reports no event for a load that fails before or after it
// commits (the wkwebview `WryNavigationDelegate` has no `didFailProvisionalNavigation:` and no `didFailNavigation:`). So
// there the deadline starts where the launch cover starts its own: with the window, and when each document commits.
const BAR_DEADLINE: std::time::Duration = std::time::Duration::from_millis(15000);

#[derive(Default)]
pub struct FrameState(std::sync::Mutex<Frame>);

#[derive(Debug, Default, PartialEq, Eq)]
struct Frame {
    load: u64,
    bar: bool,
    native: bool,
}

// What one frame event does: the native frame and the answer of the snap region over the maximize action that it changes, and
// the load whose deadline it starts.
#[derive(Debug, Default, PartialEq, Eq)]
struct FrameChange {
    native: Option<bool>,
    snap_region: Option<bool>,
    deadline: Option<u64>,
}

impl Frame {
    // Load 0 is the window before its first document commits.
    fn window_created(&self, platform: Platform) -> FrameChange {
        FrameChange {
            deadline: (platform == Platform::MacOs).then_some(0),
            ..FrameChange::default()
        }
    }

    // A new main-frame document starts with no bar, so the snap region stops answering until that document reports one. A
    // newer load makes the deadline of each older load change nothing (`deadline_passed`).
    fn load_started(&mut self, platform: Platform) -> FrameChange {
        self.load = self.load.wrapping_add(1);
        self.bar = false;
        FrameChange {
            native: None,
            snap_region: Some(false),
            deadline: (platform == Platform::MacOs).then_some(self.load),
        }
    }

    // On macOS the deadline of this load started at its commit, which comes first, so this one can only repeat its change.
    fn load_finished(&self) -> FrameChange {
        FrameChange {
            deadline: Some(self.load),
            ..FrameChange::default()
        }
    }

    fn bar_reported(&mut self, drawn: bool) -> FrameChange {
        self.bar = drawn;
        FrameChange {
            native: self.native_frame(!drawn),
            snap_region: Some(drawn),
            deadline: None,
        }
    }

    fn deadline_passed(&mut self, load: u64) -> FrameChange {
        if load != self.load || self.bar {
            return FrameChange::default();
        }
        FrameChange {
            native: self.native_frame(true),
            ..FrameChange::default()
        }
    }

    fn native_frame(&mut self, native: bool) -> Option<bool> {
        (self.native != native).then(|| {
            self.native = native;
            native
        })
    }
}

pub fn window_created(window: &WebviewWindow) {
    let change = window
        .state::<FrameState>()
        .0
        .recover_lock()
        .window_created(Platform::current());
    if let Err(error) = change_frame(window, change) {
        eprintln!("Cannot start the window bar deadline: {error}");
    }
}

// The frame follows the bar only on a platform whose page draws one.
pub fn page_loading(window: &WebviewWindow, event: tauri::webview::PageLoadEvent) {
    let platform = Platform::current();
    if platform.name().is_none() {
        return;
    }
    let state = window.state::<FrameState>();
    match event {
        tauri::webview::PageLoadEvent::Started => {
            let change = state.0.recover_lock().load_started(platform);
            if let Err(error) = change_frame(window, change) {
                eprintln!("Cannot stop the window snap region: {error}");
            }
        }
        tauri::webview::PageLoadEvent::Finished => {
            let change = state.0.recover_lock().load_finished();
            if let Err(error) = change_frame(window, change) {
                eprintln!("Cannot start the window bar deadline: {error}");
            }
        }
    }
}

// tauri-runtime-wry reloads a webview whose content process ends only when the app sets no handler for that event (its default
// `with_on_web_content_process_terminate_handler`), so this handler reloads it too. The ended document took its bar with it,
// and a reload that fails before it commits reports no event, so the main window counts a new load with no bar here.
#[cfg(target_os = "macos")]
pub fn content_process_ended(webview: &tauri::Webview) {
    if let Some(window) = webview.app_handle().get_webview_window(webview.label()) {
        if window.label() == "main" {
            page_loading(&window, tauri::webview::PageLoadEvent::Started);
        }
    }
    // The handler runs inside the WKWebView delegate, where the default handler only tries to borrow the window list of the
    // runtime, so the reload goes through the event loop from another thread.
    let webview = webview.clone();
    std::thread::spawn(move || {
        if let Err(error) = webview.reload() {
            eprintln!("Cannot reload the webview after its content process ended: {error}");
        }
    });
}

fn start_deadline(window: &WebviewWindow, load: u64) {
    let window = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(BAR_DEADLINE);
        // A bar report changes the frame on the main thread, so the deadline decides and applies its change there too.
        let app = window.app_handle().clone();
        let scheduled = app.run_on_main_thread(move || {
            let change = window
                .state::<FrameState>()
                .0
                .recover_lock()
                .deadline_passed(load);
            if let Err(error) = change_frame(&window, change) {
                eprintln!("Cannot restore the native window frame: {error}");
            }
        });
        if let Err(error) = scheduled {
            eprintln!("Cannot schedule the window bar deadline: {error}");
        }
    });
}

fn report_bar(window: &WebviewWindow, drawn: bool) -> tauri::Result<()> {
    if Platform::current().name().is_none() {
        return Ok(());
    }
    let change = window
        .state::<FrameState>()
        .0
        .recover_lock()
        .bar_reported(drawn);
    change_frame(window, change)
}

fn change_frame(window: &WebviewWindow, change: FrameChange) -> tauri::Result<()> {
    if let Some(native) = change.native {
        show_native_frame(window, Platform::current(), native)?;
    }
    #[cfg(windows)]
    if let Some(active) = change.snap_region {
        crate::launch::with_native(window, move |pointer| unsafe {
            orbit_caption_set_active(pointer, active)
        })?;
    }
    #[cfg(not(windows))]
    let _ = change.snap_region;
    if let Some(load) = change.deadline {
        start_deadline(window, load);
    }
    Ok(())
}

fn show_native_frame(
    window: &impl BarWindow,
    platform: Platform,
    native: bool,
) -> tauri::Result<()> {
    match platform {
        // Each shadow change happens while the frame is native: tauri-runtime-wry attaches its undecorated resize handler with
        // the shadow the window has when decorations turn off (`WindowMessage::SetDecorations`), and `shadow: true` draws a
        // border on an undecorated window.
        Platform::Windows if native => {
            window.set_decorations(true)?;
            window.set_shadow(true)
        }
        Platform::Windows => {
            window.set_shadow(false)?;
            window.set_decorations(false)
        }
        // tauri-runtime-wry `WindowMessage::SetTitleBarStyle` runs on the main thread. `Visible` makes the title bar opaque
        // again, with the same style mask as a window created with it, so the native title bar drags the window.
        Platform::MacOs => window.set_title_bar_style(if native {
            tauri::utils::TitleBarStyle::Visible
        } else {
            tauri::utils::TitleBarStyle::Overlay
        }),
        Platform::Other => Ok(()),
    }
}

#[tauri::command]
pub fn desktop_window(
    window: WebviewWindow,
    action: Action,
    drawn: Option<bool>,
) -> Result<bool, String> {
    let tauri::utils::config::WebviewUrl::External(origin) = &window.config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    let current = window.url().map_err(|error| error.to_string())?;
    if !crate::command_origin::allows(window.label(), &current, origin) {
        return Err("Desktop window origin rejected".into());
    }
    if action == Action::Bar {
        let drawn = drawn.ok_or("The bar action requires drawn")?;
        report_bar(&window, drawn).map_err(|error| error.to_string())?;
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
    fn popup_menu(&self) -> tauri::Result<()>;
    fn set_decorations(&self, decorations: bool) -> tauri::Result<()>;
    fn set_shadow(&self, shadow: bool) -> tauri::Result<()>;
    fn set_title_bar_style(&self, style: tauri::utils::TitleBarStyle) -> tauri::Result<()>;
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
    // The same native menu the window carries, shown as a popup: muda's `show_context_menu_for_hwnd` tracks its parallel
    // popup handle, which keeps the labels, check states and enabled states of the menu bar, and dispatches the same events.
    fn popup_menu(&self) -> tauri::Result<()> {
        let menu = self
            .menu()
            .ok_or_else(|| std::io::Error::other("The window has no menu"))?;
        WebviewWindow::popup_menu_at(
            self,
            &menu,
            tauri::LogicalPosition::new(BAR_END_INSET, BAR_HEIGHT),
        )
    }
    fn set_decorations(&self, decorations: bool) -> tauri::Result<()> {
        WebviewWindow::set_decorations(self, decorations)
    }
    fn set_shadow(&self, shadow: bool) -> tauri::Result<()> {
        WebviewWindow::set_shadow(self, shadow)
    }
    fn set_title_bar_style(&self, style: tauri::utils::TitleBarStyle) -> tauri::Result<()> {
        WebviewWindow::set_title_bar_style(self, style)
    }
}

fn apply(window: &impl BarWindow, action: Action) -> tauri::Result<bool> {
    match action {
        Action::State | Action::Bar => {}
        Action::Drag => window.start_dragging()?,
        Action::Minimize => window.minimize()?,
        Action::Close => window.close()?,
        Action::Menu => window.popup_menu()?,
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

#[cfg(windows)]
extern "C" {
    fn orbit_caption_install(window: *mut std::ffi::c_void, hover: extern "C" fn(bool)) -> bool;
    fn orbit_caption_set_active(window: *mut std::ffi::c_void, active: bool);
}

#[cfg(windows)]
static HOVER_TARGET: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

#[cfg(any(windows, test))]
const MAXIMIZE_HOVER_EVENT: &str = "orbit-window-maximize-hover";

#[cfg(any(windows, test))]
fn hover_script(hovered: bool) -> String {
    format!(
        "window.dispatchEvent(new CustomEvent('{MAXIMIZE_HOVER_EVENT}', {{ detail: {hovered} }}));"
    )
}

// The native snap region takes the pointer from the page, so the page cannot paint the hover fill of the maximize action itself.
#[cfg(windows)]
extern "C" fn maximize_hover(hovered: bool) {
    let Some(window) = HOVER_TARGET
        .get()
        .and_then(|app| app.get_webview_window("main"))
    else {
        return;
    };
    if let Err(error) = window.eval(hover_script(hovered)) {
        eprintln!("Cannot report maximize hover: {error}");
    }
}

#[cfg(windows)]
pub fn install_snap_region(window: &WebviewWindow) -> tauri::Result<()> {
    let _ = HOVER_TARGET.set(window.app_handle().clone());
    let (sent, received) = std::sync::mpsc::sync_channel(1);
    crate::launch::with_native(window, move |pointer| {
        let installed = unsafe { orbit_caption_install(pointer, maximize_hover) };
        let _ = sent.send(installed);
    })?;
    if !received.recv().map_err(std::io::Error::other)? {
        return Err(std::io::Error::other("Cannot create the window snap region").into());
    }
    Ok(())
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
        assert!(!config.accept_first_mouse);
    }

    #[test]
    fn macos_hides_the_title_strip_keeps_the_traffic_lights_and_drags_an_inactive_window() {
        let mut config = crate::context().config().app.windows[0].clone();
        assert!(!config.accept_first_mouse);
        configure_frame(&mut config, Platform::MacOs);
        assert!(config.decorations);
        assert_eq!(config.title_bar_style, tauri::utils::TitleBarStyle::Overlay);
        assert!(config.hidden_title);
        let position = config.traffic_light_position.unwrap();
        assert_eq!((position.x, position.y), (16.0, 17.0));
        assert!(config.accept_first_mouse);
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
                assert_eq!(config.accept_first_mouse, cfg!(target_os = "macos"));
                Ok(())
            },
            || Ok(()),
        )
        .unwrap();
    }

    #[test]
    fn the_root_attribute_exists_only_on_the_environment_origin_and_a_custom_frame() {
        let origin: tauri::Url = "https://app.useorbit.org/".parse().unwrap();
        let windows = initialization_script(&origin, Platform::Windows);
        assert!(windows.contains("window.top === window"));
        assert!(windows.contains("window.location.origin === \"https://app.useorbit.org\""));
        assert!(windows.contains("setAttribute('data-desktop-window-bar', \"windows\")"));
        assert!(initialization_script(&origin, Platform::MacOs).contains("\"macos\")"));
        assert_eq!(initialization_script(&origin, Platform::Other), "");
    }

    #[test]
    fn the_hover_script_fires_the_event_the_page_listens_for() {
        assert_eq!(
            hover_script(true),
            "window.dispatchEvent(new CustomEvent('orbit-window-maximize-hover', { detail: true }));"
        );
        assert!(hover_script(false).contains("detail: false"));
    }

    #[test]
    fn actions_deserialize_from_the_names_the_page_sends() {
        for (name, action) in [
            ("state", Action::State),
            ("drag", Action::Drag),
            ("minimize", Action::Minimize),
            ("toggle_maximize", Action::ToggleMaximize),
            ("close", Action::Close),
            ("menu", Action::Menu),
            ("bar", Action::Bar),
        ] {
            let parsed: Action = serde_json::from_str(&format!("\"{name}\"")).unwrap();
            assert_eq!(parsed, action);
        }
        assert!(serde_json::from_str::<Action>("\"destroy\"").is_err());
    }

    struct Recorder {
        maximized: Cell<bool>,
        calls: RefCell<Vec<String>>,
    }

    impl Recorder {
        fn new(maximized: bool) -> Self {
            Self {
                maximized: Cell::new(maximized),
                calls: RefCell::new(Vec::new()),
            }
        }
        fn record(&self, call: impl Into<String>) -> tauri::Result<()> {
            self.calls.borrow_mut().push(call.into());
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
        fn popup_menu(&self) -> tauri::Result<()> {
            self.record("popup_menu")
        }
        fn set_decorations(&self, decorations: bool) -> tauri::Result<()> {
            self.record(format!("set_decorations({decorations})"))
        }
        fn set_shadow(&self, shadow: bool) -> tauri::Result<()> {
            self.record(format!("set_shadow({shadow})"))
        }
        fn set_title_bar_style(&self, style: tauri::utils::TitleBarStyle) -> tauri::Result<()> {
            self.record(format!("set_title_bar_style({style:?})"))
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
            (Action::Menu, false, Some("popup_menu"), false),
            (Action::Menu, true, Some("popup_menu"), true),
            (Action::Bar, false, None, false),
            (Action::Bar, true, None, true),
        ] {
            let window = Recorder::new(maximized);
            assert_eq!(apply(&window, action).unwrap(), after);
            assert_eq!(window.calls.borrow().as_slice(), call.as_slice());
        }
    }

    fn change(native: Option<bool>, snap_region: Option<bool>) -> FrameChange {
        FrameChange {
            native,
            snap_region,
            deadline: None,
        }
    }

    fn deadline(load: u64) -> FrameChange {
        FrameChange {
            deadline: Some(load),
            ..FrameChange::default()
        }
    }

    #[test]
    fn the_deadline_of_a_windows_load_starts_only_when_the_load_finishes() {
        let mut frame = Frame::default();
        assert_eq!(frame.window_created(Platform::Windows), change(None, None));
        assert_eq!(
            frame.load_started(Platform::Windows),
            change(None, Some(false))
        );
        assert_eq!(frame.load_finished(), deadline(frame.load));
    }

    #[test]
    fn the_deadline_of_a_macos_load_starts_with_the_window_and_when_each_document_commits() {
        let mut frame = Frame::default();
        assert_eq!(frame.window_created(Platform::MacOs), deadline(0));
        assert_eq!(
            frame.load_started(Platform::MacOs),
            FrameChange {
                deadline: Some(1),
                ..change(None, Some(false))
            }
        );
        assert_eq!(frame.load_finished(), deadline(1));
    }

    #[test]
    fn a_macos_document_that_commits_and_never_finishes_gets_the_native_frame_after_the_deadline() {
        let mut frame = Frame::default();
        let load = frame.load_started(Platform::MacOs).deadline.unwrap();
        assert_eq!(frame.deadline_passed(load), change(Some(true), None));
        // A `Finished` deadline of the same load comes later and repeats nothing.
        assert_eq!(frame.deadline_passed(load), change(None, None));
        assert_eq!(frame.bar_reported(true), change(Some(false), Some(true)));
    }

    #[test]
    fn a_newer_macos_document_cancels_the_commit_deadline_of_the_older_one() {
        let mut frame = Frame::default();
        let older = frame.load_started(Platform::MacOs).deadline.unwrap();
        let newer = frame.load_started(Platform::MacOs).deadline.unwrap();
        assert_eq!(frame.deadline_passed(older), change(None, None));
        assert!(!frame.native);
        assert_eq!(frame.deadline_passed(newer), change(Some(true), None));
    }

    #[test]
    fn each_platform_shows_and_removes_its_native_frame_with_its_own_window_calls() {
        for (platform, native, calls) in [
            (
                Platform::Windows,
                true,
                &["set_decorations(true)", "set_shadow(true)"][..],
            ),
            (
                Platform::Windows,
                false,
                &["set_shadow(false)", "set_decorations(false)"][..],
            ),
            (Platform::MacOs, true, &["set_title_bar_style(Visible)"][..]),
            (
                Platform::MacOs,
                false,
                &["set_title_bar_style(Overlay)"][..],
            ),
            (Platform::Other, true, &[][..]),
            (Platform::Other, false, &[][..]),
        ] {
            let window = Recorder::new(false);
            show_native_frame(&window, platform, native).unwrap();
            assert_eq!(window.calls.borrow().as_slice(), calls);
        }
    }

    #[test]
    fn a_first_document_that_never_commits_gets_the_native_frame_after_the_deadline() {
        let mut frame = Frame::default();
        assert_eq!(frame.deadline_passed(0), change(Some(true), None));
        assert_eq!(frame.bar_reported(true), change(Some(false), Some(true)));
    }

    #[test]
    fn a_first_document_that_commits_cancels_the_deadline_of_the_window() {
        let mut frame = Frame::default();
        frame.load_started(Platform::MacOs);
        assert_eq!(frame.deadline_passed(0), change(None, None));
        assert!(!frame.native);
    }

    #[test]
    fn a_launch_that_draws_the_bar_never_changes_the_frame() {
        let mut frame = Frame::default();
        assert_eq!(
            frame.load_started(Platform::Windows),
            change(None, Some(false))
        );
        assert_eq!(frame.bar_reported(true), change(None, Some(true)));
        assert_eq!(frame.deadline_passed(frame.load), change(None, None));
        assert!(!frame.native);
    }

    #[test]
    fn a_document_without_the_bar_gets_the_native_frame_once_the_deadline_passes() {
        let mut frame = Frame::default();
        frame.load_started(Platform::Windows);
        let load = frame.load;
        assert_eq!(frame.deadline_passed(load), change(Some(true), None));
        assert!(frame.native);
        assert_eq!(frame.deadline_passed(load), change(None, None));
    }

    #[test]
    fn a_bar_that_reports_late_removes_the_restored_frame_and_starts_the_snap_region() {
        let mut frame = Frame::default();
        frame.load_started(Platform::Windows);
        frame.deadline_passed(frame.load);
        assert_eq!(frame.bar_reported(true), change(Some(false), Some(true)));
        assert!(!frame.native);
    }

    #[test]
    fn a_bar_that_goes_away_restores_the_frame_and_stops_the_snap_region_at_once() {
        let mut frame = Frame::default();
        frame.load_started(Platform::Windows);
        frame.bar_reported(true);
        assert_eq!(frame.bar_reported(false), change(Some(true), Some(false)));
        assert_eq!(frame.deadline_passed(frame.load), change(None, None));
    }

    #[test]
    fn a_new_document_stops_the_snap_region_and_the_deadline_of_the_previous_load() {
        let mut frame = Frame::default();
        frame.load_started(Platform::Windows);
        let previous = frame.load;
        frame.bar_reported(true);
        assert_eq!(
            frame.load_started(Platform::Windows),
            change(None, Some(false))
        );
        assert!(!frame.bar);
        assert_eq!(frame.deadline_passed(previous), change(None, None));
        assert!(!frame.native);
        assert_eq!(frame.bar_reported(true), change(None, Some(true)));
    }

    #[test]
    fn the_bar_deadline_is_the_launch_cover_deadline() {
        let cover = include_str!("../native/windows/launch.cpp");
        assert!(cover.contains(&format!(
            "SetTimer(launch.window, launch.timer, {}, nullptr)",
            BAR_DEADLINE.as_millis()
        )));
        assert!(include_str!("launch.js").contains(&format!(
            "setTimeout(() => observer.disconnect(), {})",
            BAR_DEADLINE.as_millis()
        )));
        assert!(include_str!("../native/macos/launch.m").contains(&format!(
            "timerWithTimeInterval:{} repeats:NO",
            BAR_DEADLINE.as_secs()
        )));
    }
}
