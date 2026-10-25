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
mod push_state;
#[cfg(windows)]
mod push_windows;
mod settings;
mod update_manifest;
mod update_state;
mod updates;
mod web_release;

fn main() {
    let context = context();
    let identifier = context.config().identifier.clone();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_login::commit_desktop_login,
            push::desktop_push
        ])
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Err(error) = lifecycle::show_main(app) {
                eprintln!("Cannot restore desktop window: {error}");
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
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
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
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
                    open_new_window(url, |url| tauri_plugin_opener::open_url(url, None::<&str>))
                })
                .build()?;
            lifecycle::show_main(app.handle())?;
            desktop_login::attach_callbacks(app.handle(), callbacks_flow)?;
            updates::start(app.handle())?;
            Ok(())
        })
        .build(context)
        .expect("desktop application failed")
        .run(|_app, _event| {
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
        let Some(FrontendDist::Url(origin)) = &config.build.frontend_dist else {
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
