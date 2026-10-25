use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

#[cfg(any(windows, test))]
#[derive(Deserialize, Debug, PartialEq)]
pub struct RawNotice {
    pub title: String,
    pub body: Option<String>,
    pub url: Option<String>,
}

#[cfg(any(target_os = "macos", test))]
pub fn apns_launch_path(payload: &str) -> String {
    let payload = serde_json::from_str::<serde_json::Value>(payload).ok();
    launch_path(
        payload
            .as_ref()
            .and_then(|payload| payload.get("body"))
            .and_then(|body| body.get("url"))
            .and_then(serde_json::Value::as_str),
    )
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub apns_topic: Option<String>,
    pub device_id: Uuid,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushState {
    pub device_id: Uuid,
    pub owner: Option<String>,
    pub registration: Option<Registration>,
}

impl PushState {
    pub fn load(path: &Path) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        match std::fs::read(path) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let state = Self {
                    device_id: Uuid::new_v4(),
                    owner: None,
                    registration: None,
                };
                state.save(path)?;
                Ok(state)
            }
            Err(error) => Err(error.into()),
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        std::fs::create_dir_all(path.parent().ok_or("Missing push settings directory")?)?;
        std::fs::write(path, serde_json::to_vec(self)?)?;
        Ok(())
    }

    pub fn registration(
        &self,
        endpoint: String,
        topic: &str,
        windows: bool,
    ) -> Result<Registration, &'static str> {
        let transport = if windows { "wns" } else { "apns" };
        if windows {
            let url = tauri::Url::parse(&endpoint).map_err(|_| "Invalid WNS endpoint")?;
            let host = url.host_str().ok_or("Missing WNS host")?;
            if url.scheme() != "https"
                || url.port_or_known_default() != Some(443)
                || !url.username().is_empty()
                || url.password().is_some()
                || url.fragment().is_some()
                || !(host == "notify.windows.com" || host.ends_with(".notify.windows.com"))
            {
                return Err("Invalid WNS endpoint");
            }
        } else if endpoint.is_empty()
            || !endpoint.bytes().all(|byte| byte.is_ascii_hexdigit())
            || !matches!(
                topic,
                "org.useorbit.desktop" | "org.useorbit.desktop.staging"
            )
        {
            return Err("Invalid APNs registration");
        }
        Ok(Registration {
            endpoint,
            p256dh: transport.into(),
            auth: transport.into(),
            apns_topic: (!windows).then(|| topic.into()),
            device_id: self.device_id,
        })
    }
}

pub fn launch_path(url: Option<&str>) -> String {
    let mut destination: tauri::Url = "https://app.useorbit.org/".parse().unwrap();
    if let Some(url) = url {
        destination
            .query_pairs_mut()
            .append_pair("notificationUrl", url);
    }
    format!(
        "/{}",
        destination
            .query()
            .map(|query| format!("?{query}"))
            .unwrap_or_default()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_payloads_preserve_the_producers_localized_content_and_nested_apns_destination() {
        for (title, body) in [
            ("Time to read", "Keep your habit going"),
            ("Hora de ler", "Continue seu hábito 📚"),
        ] {
            let url = "/chat?proactiveId=example";
            let raw = serde_json::json!({ "title": title, "body": body, "url": url });
            let notice: RawNotice = serde_json::from_value(raw).unwrap();
            assert_eq!(
                notice,
                RawNotice {
                    title: title.into(),
                    body: Some(body.into()),
                    url: Some(url.into())
                }
            );
            let apns = serde_json::json!({ "aps": { "alert": { "title": title, "body": body }, "sound": "default" }, "body": { "url": url } });
            assert_eq!(apns_launch_path(&apns.to_string()), launch_path(Some(url)));
        }
        assert_eq!(
            apns_launch_path(
                r#"{"aps":{"alert":{"title":"Orbit","body":"Reminder"}},"body":{"url":null}}"#
            ),
            "/"
        );
        assert!(serde_json::from_str::<RawNotice>(r#"{"title":123}"#).is_err());
        assert_eq!(apns_launch_path("invalid"), "/");
    }

    #[test]
    fn renewal_and_restart_preserve_the_device_identity() {
        let directory = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let path = directory.join("push.json");
        let mut state = PushState::load(&path).unwrap();
        let first = state
            .registration(
                "https://dm3p.notify.windows.com/?token=first".into(),
                "",
                true,
            )
            .unwrap();
        state.owner = Some("account-a".into());
        state.registration = Some(first.clone());
        state.save(&path).unwrap();
        let restarted = PushState::load(&path).unwrap();
        let renewed = restarted
            .registration(
                "https://dm3p.notify.windows.com/?token=renewed".into(),
                "",
                true,
            )
            .unwrap();
        assert_eq!(first.device_id, renewed.device_id);
        assert_ne!(first.endpoint, renewed.endpoint);
        assert_eq!(restarted.owner.as_deref(), Some("account-a"));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn native_registrations_accept_only_the_transport_contract() {
        let state = PushState {
            device_id: Uuid::new_v4(),
            owner: None,
            registration: None,
        };
        for endpoint in [
            "http://notify.windows.com/",
            "https://notify.windows.com.evil.org/",
            "https://user@notify.windows.com/",
            "https://notify.windows.com:444/",
            "https://notify.windows.com/#fragment",
        ] {
            assert!(state.registration(endpoint.into(), "", true).is_err());
        }
        for topic in ["org.useorbit.desktop", "org.useorbit.desktop.staging"] {
            let registration = state.registration("ab1234ef".into(), topic, false).unwrap();
            assert_eq!(registration.apns_topic.as_deref(), Some(topic));
            assert_eq!(registration.p256dh, "apns");
        }
        assert!(state
            .registration("not-a-token".into(), "org.useorbit.desktop", false)
            .is_err());
        assert!(state
            .registration("abcdef".into(), "another.topic", false)
            .is_err());
    }

    #[test]
    fn clicks_use_the_web_worker_launch_contract_without_opening_external_origins() {
        for url in [
            "/chat?proactiveId=example",
            "/progress?wrapped=month&year=2026&month=9",
            "/habits/example",
            "https://untrusted.example/?x=1#fragment",
        ] {
            let path = launch_path(Some(url));
            let destination = tauri::Url::parse("https://app-staging.useorbit.org/")
                .unwrap()
                .join(&path)
                .unwrap();
            assert_eq!(destination.host_str(), Some("app-staging.useorbit.org"));
            assert_eq!(destination.path(), "/");
            assert_eq!(
                destination.query_pairs().collect::<Vec<_>>(),
                vec![("notificationUrl".into(), url.into())]
            );
        }
        assert_eq!(launch_path(None), "/");
    }
}
