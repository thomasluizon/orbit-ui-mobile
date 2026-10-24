#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(context())
        .expect("desktop application failed");
}

fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

#[cfg(test)]
mod tests {
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
        assert_eq!(
            config.app.windows[0].url,
            WebviewUrl::External(origin.clone())
        );
    }

    #[test]
    fn webview_uses_persistent_storage_without_native_privileges() {
        let context = super::context();
        let config = context.config();
        assert!(!config.app.windows[0].incognito);
        assert!(!config.app.with_global_tauri);
        assert!(config.app.security.capabilities.is_empty());
    }
}
