use tauri::{AppHandle, Manager, Url};

pub fn show_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
    }
    Ok(())
}

pub fn destination(origin: &Url, identifier: &str, link: &Url) -> Option<Url> {
    if link.scheme() != identifier
        || link.host_str() != Some("app")
        || !link.username().is_empty()
        || link.password().is_some()
        || link.port().is_some()
        || link.query().is_some()
        || link.fragment().is_some()
        || !known_path(link.path())
    {
        return None;
    }
    origin.join(link.path()).ok()
}

fn known_path(path: &str) -> bool {
    matches!(
        path,
        "/" | "/calendar"
            | "/progress"
            | "/progress/achievements"
            | "/progress/goals"
            | "/progress/streak"
            | "/profile"
            | "/profile/account"
            | "/profile/astra"
            | "/profile/notifications"
            | "/profile/preferences"
            | "/notifications"
            | "/search"
            | "/support"
            | "/about"
            | "/upgrade"
            | "/wrapped"
            | "/habits/new"
    ) || path.strip_prefix("/habits/").is_some_and(|identifier| {
        identifier.len() == 36
            && identifier.bytes().enumerate().all(|(index, byte)| {
                if matches!(index, 8 | 13 | 18 | 23) {
                    byte == b'-'
                } else {
                    byte.is_ascii_hexdigit()
                }
            })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_links_route_only_to_the_matching_environment() {
        for (identifier, origin) in [
            ("org.useorbit.desktop", "https://app.useorbit.org"),
            (
                "org.useorbit.desktop.staging",
                "https://app-staging.useorbit.org",
            ),
        ] {
            let origin = Url::parse(origin).unwrap();
            for path in [
                "/",
                "/calendar",
                "/profile/preferences",
                "/progress/goals",
                "/habits/123e4567-e89b-12d3-a456-426614174000",
            ] {
                let link = Url::parse(&format!("{identifier}://app{path}")).unwrap();
                assert_eq!(
                    destination(&origin, identifier, &link),
                    Some(origin.join(path).unwrap())
                );
            }
            let other = if identifier.ends_with("staging") {
                "org.useorbit.desktop"
            } else {
                "org.useorbit.desktop.staging"
            };
            assert!(destination(
                &origin,
                identifier,
                &Url::parse(&format!("{other}://app/calendar")).unwrap()
            )
            .is_none());
        }
    }

    #[test]
    fn untrusted_links_cannot_navigate_or_carry_credentials() {
        let origin = Url::parse("https://app.useorbit.org").unwrap();
        for link in [
            "https://app/calendar",
            "file:///calendar",
            "org.useorbit.desktop://evil/calendar",
            "org.useorbit.desktop://app.evil/calendar",
            "org.useorbit.desktop://user@app/calendar",
            "org.useorbit.desktop://app:443/calendar",
            "org.useorbit.desktop://app/calendar?token=secret",
            "org.useorbit.desktop://app/calendar#secret",
            "org.useorbit.desktop://app/api/auth/logout",
            "org.useorbit.desktop://app/unknown",
            "org.useorbit.desktop://app//evil.org",
            "org.useorbit.desktop://app/habits/not-an-id",
            "org.useorbit.desktop://app/habits/%2Fcalendar",
            "org.useorbit.desktop://auth/callback?code=handoff&state=state",
        ] {
            assert!(
                destination(&origin, "org.useorbit.desktop", &Url::parse(link).unwrap()).is_none(),
                "{link}"
            );
        }
    }
}
