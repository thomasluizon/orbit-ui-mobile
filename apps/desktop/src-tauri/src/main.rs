#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::webview::NewWindowResponse;
use tauri::Manager;

mod auth;
#[cfg(feature = "bench-loopback")]
mod bench_viewport;
mod command_origin;
mod desktop_login;
mod launch;
mod lifecycle;
mod links;
mod localization;
mod locks;
mod menus;
mod push;
mod push_action;
mod push_state;
#[cfg(any(windows, test))]
mod push_windows;
mod settings;
mod update_manifest;
mod update_resume;
mod update_state;
mod updates;
mod web_release;
mod window_bar;

fn main() {
    let context = context();
    let app = desktop_builder(context.config().identifier.clone())
        .build(context)
        .expect("desktop application failed");
    if let Err(error) = push::prepare_launch() {
        eprintln!("Cannot observe desktop launch: {error}");
    }
    app.run(handle_run_event);
}

fn desktop_builder(identifier: String) -> tauri::Builder<tauri::Wry> {
    let builder = tauri::Builder::default();
    let window_state =
        tauri_plugin_window_state::Builder::new().with_state_flags(lifecycle::window_state_flags());
    #[cfg(feature = "bench-loopback")]
    let window_state = window_state.skip_initial_state("main");
    #[cfg(target_os = "macos")]
    let builder = builder.activate_ignoring_other_apps(false);
    builder
        .invoke_handler(tauri::generate_handler![
            desktop_login::commit_desktop_login,
            push::desktop_push,
            updates::desktop_update,
            launch::desktop_launch,
            window_bar::desktop_window,
            #[cfg(feature = "bench-loopback")]
            bench_viewport::fit_bench_viewport
        ])
        .plugin(tauri_plugin_single_instance::init(|app, arguments, _| {
            push::secondary_launch(&arguments);
            if let Err(error) = lifecycle::show_main(app) {
                eprintln!("Cannot restore desktop window: {error}");
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name(identifier)
                .build(),
        )
        .plugin(window_state.build())
        .on_menu_event(menus::handle)
        .on_window_event(lifecycle::on_window_event)
        .setup(setup)
}

fn handle_run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::ExitRequested { code, api, .. } = &event {
        if *code != Some(tauri::RESTART_EXIT_CODE) && updates::request_quit(app) {
            api.prevent_exit();
        }
    }
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Reopen { .. } = event {
        if let Err(error) = lifecycle::show_main(app) {
            eprintln!("Cannot reopen desktop window: {error}");
        }
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let tauri::utils::config::WebviewUrl::External(origin) = &app.config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    let flow = Arc::new(Mutex::new(auth::AuthFlow::new(
        origin.clone(),
        &app.config().identifier,
    )?));
    app.manage(flow.clone());
    let callbacks_flow = flow.clone();
    menus::install(app.handle())?;
    if let Err(error) = push::start(app.handle()) {
        eprintln!("Cannot start desktop push: {error}");
    }
    build_main_window(app, origin, flow.clone())?;
    desktop_login::attach_callbacks(app.handle(), callbacks_flow)?;
    updates::start(app.handle())?;
    Ok(())
}

fn build_main_window(
    app: &tauri::App,
    origin: &tauri::Url,
    flow: desktop_login::SharedAuth,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut window_config = app.config().app.windows[0].clone();
    let settings = match settings::DesktopSettings::load(&settings::path(app.handle())?) {
        Ok(settings) => settings,
        Err(error) => {
            eprintln!("Cannot read desktop settings: {error}");
            settings::DesktopSettings::default()
        }
    };
    let launch_mode = settings.launch_mode;
    app.manage(Mutex::new(settings));
    #[cfg(feature = "bench-loopback")]
    bench_viewport::configure(&mut window_config)?;
    match update_resume::take(app.handle(), origin) {
        Ok(Some(destination)) => {
            window_config.url = tauri::utils::config::WebviewUrl::External(destination)
        }
        Ok(None) => {}
        Err(error) => eprintln!("Cannot restore desktop update route: {error}"),
    }
    lifecycle::create_main(
        window_config,
        push::notification_launch(),
        launch_mode,
        |config| construct_window(app, config, origin, flow),
        || lifecycle::show_main(app.handle()),
    )
    .map_err(Into::into)
}

fn construct_window(
    app: &tauri::App,
    window_config: &tauri::utils::config::WindowConfig,
    origin: &tauri::Url,
    flow: desktop_login::SharedAuth,
) -> tauri::Result<()> {
    app.manage(launch::LaunchState::default());
    let navigation_origin = origin.clone();
    let handle = app.handle().clone();
    let window = tauri::WebviewWindowBuilder::from_config(app, window_config)?
        .initialization_script(launch::initialization_script(origin))
        .initialization_script(web_release::initialization_script(
            origin,
            &app.package_info().version.to_string(),
        ))
        .initialization_script(window_bar::initialization_script(
            origin,
            window_bar::Platform::current(),
        ))
        .on_navigation(move |url| {
            navigate_main(
                &navigation_origin,
                url,
                || {
                    desktop_login::start(handle.clone(), flow.clone());
                },
                |url| tauri_plugin_opener::open_url(url, None::<&str>),
            )
        })
        .on_page_load(|window, payload| {
            launch::page_loading(&window, payload.event());
            push::page_loaded(&window, payload);
        })
        .on_new_window(|url, _features| {
            open_new_window(url, |url| tauri_plugin_opener::open_url(url, None::<&str>))
        })
        .build()?;
    #[cfg(feature = "bench-loopback")]
    {
        window.remove_menu()?;
    }
    // WHY: the native menu bar would draw under the Orbit bar; hide_menu keeps the menu registered for the window (muda `hide_for_hwnd`).
    #[cfg(windows)]
    window.hide_menu()?;
    launch::install(&window, window_config)?;
    drop(window);
    Ok(())
}

fn navigate_main(
    origin: &tauri::Url,
    url: &tauri::Url,
    sign_in: impl FnOnce(),
    open: impl FnOnce(&str) -> Result<(), tauri_plugin_opener::Error>,
) -> bool {
    if auth::intercepts(origin, url) {
        sign_in();
        return false;
    }
    if url.origin() == origin.origin() || is_embedded_frame(url) {
        return true;
    }
    open_new_window(url.clone(), open);
    false
}

// WKWebView reports subframe loads to on_navigation without a frame flag (#2050), so the web CSP frame-src origins and the Turnstile challenge documents stay in the webview (#2056).
const EMBEDDED_FRAME_ORIGINS: [&str; 1] = ["https://challenges.cloudflare.com"];
const EMBEDDED_FRAME_DOCUMENTS: [&str; 2] = ["about:srcdoc", "about:blank"];

fn is_embedded_frame(url: &tauri::Url) -> bool {
    EMBEDDED_FRAME_DOCUMENTS.contains(&url.as_str())
        || EMBEDDED_FRAME_ORIGINS.contains(&url.origin().ascii_serialization().as_str())
}

fn open_new_window(
    url: tauri::Url,
    open: impl FnOnce(&str) -> Result<(), tauri_plugin_opener::Error>,
) -> NewWindowResponse<tauri::Wry> {
    if matches!(url.scheme(), "http" | "https") {
        if let Err(error) = open(url.as_str()) {
            eprintln!("Failed to open link in the system browser: {error}");
        }
    }
    NewWindowResponse::Deny
}

fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

#[cfg(test)]
mod tests {
    use super::{open_new_window, NewWindowResponse};
    use tauri::utils::config::{FrontendDist, WebviewUrl};

    #[test]
    fn main_navigation_keeps_the_app_origin_and_the_csp_frame_origin_and_intercepts_sign_in() {
        let origin = "https://app.useorbit.org/".parse().unwrap();
        for (destination, accepted, external, intercepted) in [
            ("https://app.useorbit.org/calendar", true, false, false),
            ("about:srcdoc", true, false, false),
            ("about:blank", true, false, false),
            ("about:blank#frame", false, false, false),
            ("about:srcdoc?frame", false, false, false),
            ("about:config", false, false, false),
            ("data:text/html,frame", false, false, false),
            ("javascript:alert(1)", false, false, false),
            (
                "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/av0/rch/frame/0x4AAAAAAA/auto/fbE/new/normal",
                true,
                false,
                false,
            ),
            ("https://challenges.cloudflare.com.attacker.example/", false, true, false),
            ("http://challenges.cloudflare.com/", false, true, false),
            ("https://challenges.cloudflare.com:8443/", false, true, false),
            ("https://cloudflare.com/", false, true, false),
            ("https://example.com/", false, true, false),
            ("http://example.com/", false, true, false),
            ("file:///private", false, false, false),
            (
                "https://app.useorbit.org/api/auth/google/start?purpose=signin",
                false,
                false,
                true,
            ),
        ] {
            let mut opened = false;
            let mut signed_in = false;
            assert_eq!(
                super::navigate_main(
                    &origin,
                    &destination.parse().unwrap(),
                    || signed_in = true,
                    |url| {
                        assert_eq!(url, destination);
                        opened = true;
                        Ok(())
                    }
                ),
                accepted,
                "{destination}"
            );
            assert_eq!(opened, external, "{destination}");
            assert_eq!(signed_in, intercepted, "{destination}");
        }
    }

    #[test]
    fn native_context_loads_the_deployed_app_without_bundled_assets() {
        let context = super::context();
        let config = context.config();
        assert!(config.build.frontend_dist.is_none());
        let WebviewUrl::External(origin) = &config.app.windows[0].url else {
            panic!("desktop must load the deployed web app");
        };
        assert_eq!(origin.scheme(), "https");
        assert!(matches!(
            origin.as_str(),
            "https://app-staging.useorbit.org/" | "https://app.useorbit.org/"
        ));
        assert_eq!(config.app.windows.len(), 1);
        assert!(!config.app.windows[0].create);
        assert_eq!(
            config.app.windows[0].url,
            WebviewUrl::External(origin.clone())
        );
    }

    #[test]
    fn webview_uses_persistent_storage_with_only_session_completion() {
        let context = super::context();
        let config = context.config();
        assert!(!config.app.windows[0].incognito);
        assert!(!config.app.with_global_tauri);
        assert_eq!(config.app.security.capabilities.len(), 1);
    }

    #[test]
    fn deployed_webview_can_invoke_its_commands_without_granting_other_origins() {
        let mut context = super::context();
        let config = context.config().clone();
        let WebviewUrl::External(origin) = &config.app.windows[0].url else {
            panic!("desktop must load the deployed web app");
        };
        let authority = context.runtime_authority_mut();
        for command in [
            "commit_desktop_login",
            "desktop_push",
            "desktop_update",
            "desktop_launch",
        ] {
            for path in ["/", "/auth-callback?desktop=ready", "/profile/preferences"] {
                let url = origin.join(path).unwrap();
                // Match Tauri's release frontendDist classification before resolving the generated ACL.
                let execution_origin = match &config.build.frontend_dist {
                    Some(FrontendDist::Url(app_url)) if app_url.make_relative(&url).is_some() => {
                        tauri::ipc::Origin::Local
                    }
                    _ => tauri::ipc::Origin::Remote { url },
                };
                assert!(
                    authority
                        .resolve_access(command, "main", "main", &execution_origin)
                        .is_some(),
                    "{command} must be allowed at {path}"
                );
            }
            for destination in [
                "https://app-staging.useorbit.org/",
                "https://app.useorbit.org/",
                "https://app.useorbit.org.attacker.example/",
                "http://app.useorbit.org/",
            ] {
                let url: tauri::Url = destination.parse().unwrap();
                if url.origin() == origin.origin() {
                    continue;
                }
                assert!(authority
                    .resolve_access(command, "main", "main", &tauri::ipc::Origin::Remote { url })
                    .is_none());
            }
            assert!(authority
                .resolve_access(command, "main", "main", &tauri::ipc::Origin::Local)
                .is_none());
            assert!(authority
                .resolve_access(
                    command,
                    "other",
                    "other",
                    &tauri::ipc::Origin::Remote {
                        url: origin.clone()
                    }
                )
                .is_none());
        }
    }

    #[test]
    fn new_windows_open_web_links_externally_without_creating_a_webview() {
        for destination in [
            "https://app-staging.useorbit.org/share",
            "https://app.useorbit.org/share",
            "https://billing.example/invoice.pdf?download=1#receipt",
            "http://example.org/",
        ] {
            let mut opened = None;
            let response = open_new_window(destination.parse().unwrap(), |url| {
                opened = Some(url.to_owned());
                Ok(())
            });
            assert_eq!(opened.as_deref(), Some(destination));
            assert!(matches!(response, NewWindowResponse::Deny));
        }
    }

    #[test]
    fn new_windows_cannot_launch_local_files_or_other_protocol_handlers() {
        for destination in [
            "file:///invoice.pdf",
            "javascript:alert(1)",
            "data:text/html,invoice",
            "about:blank",
            "orbit://settings",
        ] {
            let response = open_new_window(destination.parse().unwrap(), |_| {
                panic!("non-web destinations must not reach the system opener")
            });
            assert!(matches!(response, NewWindowResponse::Deny));
        }
    }

    #[test]
    fn opener_failure_still_denies_a_new_webview() {
        let mut attempted = false;
        let response = open_new_window(
            "https://billing.example/invoice.pdf".parse().unwrap(),
            |_| {
                attempted = true;
                Err(std::io::Error::other("system opener unavailable").into())
            },
        );
        assert!(attempted);
        assert!(matches!(response, NewWindowResponse::Deny));
    }
}
