#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::webview::NewWindowResponse;
use tauri::Manager;

mod auth;
mod desktop_login;
mod lifecycle;
mod links;
mod localization;
mod menus;
mod push;
mod push_action;
mod push_state;
#[cfg(windows)]
mod push_windows;
mod settings;
mod update_manifest;
mod update_resume;
mod update_state;
mod updates;
mod web_release;

fn main() {
    let context = context();
    let identifier = context.config().identifier.clone();
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.activate_ignoring_other_apps(false);
    let app = builder
        .invoke_handler(tauri::generate_handler![
            desktop_login::commit_desktop_login,
            push::desktop_push,
            updates::desktop_update
        ])
        .plugin(tauri_plugin_single_instance::init(|app, _arguments, _| {
            if !push::notification_activation(&_arguments) {
                if let Err(error) = lifecycle::show_main(app) {
                    eprintln!("Cannot restore desktop window: {error}");
                }
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
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(lifecycle::window_state_flags())
                .build(),
        )
        .on_menu_event(menus::handle)
        .on_window_event(lifecycle::on_window_event)
        .setup(|app| {
            let tauri::utils::config::WebviewUrl::External(origin) =
                &app.config().app.windows[0].url
            else {
                return Err("Desktop requires a deployed origin".into());
            };
            let flow = Arc::new(Mutex::new(auth::AuthFlow::new(
                origin.clone(),
                &app.config().identifier,
            )?));
            let navigation_origin = origin.clone();
            app.manage(flow.clone());
            let callbacks_flow = flow.clone();
            let handle = app.handle().clone();
            menus::install(app.handle())?;
            push::start(app.handle())?;
            let mut window_config = app.config().app.windows[0].clone();
            if let Some(destination) = update_resume::take(app.handle(), origin)? {
                window_config.url = tauri::utils::config::WebviewUrl::External(destination);
            }
            lifecycle::create_main(
                window_config,
                push::notification_launch(),
                |window_config| {
                    tauri::WebviewWindowBuilder::from_config(app, window_config)?
                        .initialization_script(web_release::initialization_script(
                            origin,
                            &app.package_info().version.to_string(),
                        ))
                        .on_navigation(move |url| {
                            if auth::intercepts(&navigation_origin, url) {
                                desktop_login::start(handle.clone(), flow.clone());
                                return false;
                            }
                            true
                        })
                        .on_new_window(|url, _features| {
                            open_new_window(url, |url| {
                                tauri_plugin_opener::open_url(url, None::<&str>)
                            })
                        })
                        .build()?;
                    Ok(())
                },
                || lifecycle::show_main(app.handle()),
            )?;
            desktop_login::attach_callbacks(app.handle(), callbacks_flow)?;
            updates::start(app.handle())?;
            Ok(())
        })
        .build(context)
        .expect("desktop application failed");
    push::prepare_launch();
    app.run(|_app, _event| {
        if let tauri::RunEvent::ExitRequested { code, api, .. } = &_event {
            if *code != Some(tauri::RESTART_EXIT_CODE) && updates::request_quit(_app) {
                api.prevent_exit();
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            if let Err(error) = lifecycle::show_main(_app) {
                eprintln!("Cannot reopen desktop window: {error}");
            }
        }
    });
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
        for command in ["commit_desktop_login", "desktop_push", "desktop_update"] {
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
