use tauri::Url;

pub fn allows(label: &str, current: &Url, configured: &Url) -> bool {
    label == "main" && current.origin() == configured.origin()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands_accept_routes_on_the_configured_origin() {
        for origin in [
            "https://app.useorbit.org/",
            "https://app-staging.useorbit.org/",
        ] {
            let configured = Url::parse(origin).unwrap();
            for path in [
                "/",
                "/auth-callback?desktop=ready",
                "/profile/preferences#settings",
            ] {
                assert!(allows("main", &configured.join(path).unwrap(), &configured));
            }
            let mut explicit_port = configured.clone();
            explicit_port.set_port(Some(443)).unwrap();
            assert!(allows("main", &explicit_port, &configured));
        }
    }

    #[test]
    fn commands_reject_other_windows_on_the_same_origin() {
        let configured = Url::parse("https://app.useorbit.org/").unwrap();
        for label in ["", "other", "main-child", "Main"] {
            assert!(!allows(label, &configured, &configured));
        }
    }

    #[test]
    fn commands_reject_other_environments_schemes_hosts_and_ports() {
        for origin in [
            "https://app.useorbit.org/",
            "https://app-staging.useorbit.org/",
        ] {
            let configured = Url::parse(origin).unwrap();
            let host = configured.host_str().unwrap();
            let other = if host == "app.useorbit.org" {
                "app-staging.useorbit.org"
            } else {
                "app.useorbit.org"
            };
            for destination in [
                format!("https://{other}/"),
                format!("http://{host}/"),
                format!("https://{host}:444/"),
                format!("https://{host}.attacker.example/"),
                "file:///index.html".into(),
                "tauri://localhost/".into(),
            ] {
                assert!(
                    !allows("main", &destination.parse().unwrap(), &configured),
                    "{destination}"
                );
            }
        }
    }
}
