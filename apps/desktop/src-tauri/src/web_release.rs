pub fn initialization_script(origin: &tauri::Url, version: &str) -> String {
    format!(
        "if (window.top === window && window.location.origin === {}) {{ Object.defineProperty(window, '__ORBIT_DESKTOP_VERSION__', {{ value: {} }}); Object.defineProperty(window, '__ORBIT_DESKTOP_UPDATES__', {{ value: true }}); }}",
        serde_json::to_string(&origin.origin().ascii_serialization()).unwrap(),
        serde_json::to_string(version).unwrap(),
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_available_only_on_the_main_environment_origin() {
        let script = super::initialization_script(
            &"https://app-staging.useorbit.org/".parse().unwrap(),
            "0.1.2",
        );
        assert!(script.contains("window.top === window"));
        assert!(script.contains("window.location.origin === \"https://app-staging.useorbit.org\""));
        assert!(script.contains("'__ORBIT_DESKTOP_VERSION__', { value: \"0.1.2\" }"));
    }
}
