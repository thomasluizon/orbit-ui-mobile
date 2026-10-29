use serde::{Deserialize, Serialize};
use std::{io::Write, path::Path};
use uuid::Uuid;

#[derive(Default)]
pub struct PushSession {
    pub account: Option<String>,
    restored: bool,
    startup_response: Option<(String, crate::push_action::Response)>,
}

impl PushSession {
    pub fn suspend(&mut self, saved: &mut PushState, account: &str) {
        if self.account.as_deref() == Some(account) {
            self.account = None;
            self.restored = true;
            self.startup_response = None;
        }
        if saved.owner.as_deref() == Some(account) {
            if let Some(registration) = saved.registration.take() {
                saved.stage(account.into(), registration);
            }
            saved.owner = None;
        }
        for pending in &mut saved.pending {
            if pending.owner == account {
                pending.revoke = true;
            }
        }
    }
    pub fn owns(&self, saved: &PushState) -> bool {
        self.account.is_some() && self.account == saved.owner
    }

    pub fn restore(
        &mut self,
        account: Option<String>,
        saved: &PushState,
    ) -> Option<crate::push_action::Response> {
        self.account = account;
        self.account.as_ref()?;
        self.restored = true;
        self.startup_response.take().and_then(|(owner, url)| {
            (self.owns(saved) && self.account.as_deref() == Some(&owner)).then_some(url)
        })
    }

    #[cfg(any(target_os = "macos", test))]
    pub fn response(
        &mut self,
        saved: &PushState,
        payload: &str,
        done: bool,
    ) -> Option<crate::push_action::Response> {
        let destination = crate::push_action::apns_response(payload, done)?;
        if self.owns(saved) {
            return Some(destination);
        }
        if !self.restored {
            if let Some(owner) = &saved.owner {
                self.startup_response = Some((owner.clone(), destination));
            }
        }
        None
    }
}

#[cfg(any(windows, test))]
#[derive(Deserialize, Debug, PartialEq)]
pub struct RawNotice {
    pub title: String,
    pub body: Option<String>,
    #[serde(flatten)]
    pub reminder: crate::push_action::Reminder,
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
pub struct PendingRegistration {
    pub owner: String,
    pub registration: Registration,
    #[serde(default)]
    pub revoke: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushState {
    #[serde(default)]
    pub language: Option<String>,
    pub device_id: Uuid,
    pub owner: Option<String>,
    pub registration: Option<Registration>,
    #[serde(default)]
    pub pending: Vec<PendingRegistration>,
}

impl PushState {
    pub fn stage(&mut self, owner: String, registration: Registration) {
        if !self
            .pending
            .iter()
            .any(|pending| pending.owner == owner && pending.registration == registration)
        {
            self.pending.push(PendingRegistration {
                owner,
                registration,
                revoke: false,
            });
        }
    }

    pub fn commit(
        &mut self,
        owner: String,
        registration: Registration,
    ) -> Result<(), &'static str> {
        if !self
            .pending
            .iter()
            .any(|pending| pending.owner == owner && pending.registration == registration)
        {
            return Err("Native registration was not staged");
        }
        self.pending.retain(|pending| pending.owner != owner);
        self.owner = Some(owner);
        self.registration = Some(registration);
        Ok(())
    }
    pub fn load(path: &Path) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        match std::fs::read(path) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let state = Self {
                    language: None,
                    device_id: Uuid::new_v4(),
                    owner: None,
                    registration: None,
                    pending: Vec::new(),
                };
                state.save(path)?;
                Ok(state)
            }
            Err(error) => Err(error.into()),
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let directory = path.parent().ok_or("Missing push settings directory")?;
        std::fs::create_dir_all(directory)?;
        let mut file = tempfile::NamedTempFile::new_in(directory)?;
        file.write_all(&serde_json::to_vec(self)?)?;
        file.as_file().sync_all()?;
        file.persist(path)?;
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
    fn startup_apns_click_opens_once_only_for_the_restored_push_owner() {
        let saved = PushState {
            language: None,
            device_id: Uuid::new_v4(),
            owner: Some("account-a".into()),
            registration: None,
            pending: Vec::new(),
        };
        let payload = r#"{"body":{"url":"/habits/example"}}"#;
        let mut session = PushSession::default();
        let mut navigations = Vec::new();
        navigations.extend(session.response(&saved, payload, false));
        assert!(navigations.is_empty());
        navigations.extend(session.restore(None, &saved));
        navigations.extend(session.restore(Some("account-a".into()), &saved));
        navigations.extend(session.restore(Some("account-a".into()), &saved));
        assert_eq!(
            navigations,
            vec![crate::push_action::Response::Open(Some(
                "/habits/example".into()
            ))]
        );

        let mut replacement = PushSession::default();
        assert_eq!(replacement.response(&saved, payload, false), None);
        assert_eq!(replacement.restore(Some("account-b".into()), &saved), None);
        assert_eq!(replacement.restore(Some("account-a".into()), &saved), None);
    }

    #[test]
    fn startup_done_waits_for_its_owner_and_keeps_the_action_instead_of_opening() {
        let saved = PushState {
            language: Some("pt-BR".into()),
            device_id: Uuid::new_v4(),
            owner: Some("account-a".into()),
            registration: None,
            pending: Vec::new(),
        };
        let payload = r#"{"body":{"habitId":"11111111-1111-4111-8111-111111111111","doneToken":"one-use-token","url":"/"}}"#;
        let mut session = PushSession::default();
        assert_eq!(session.response(&saved, payload, true), None);
        assert_eq!(session.restore(None, &saved), None);
        assert!(matches!(
            session.restore(Some("account-a".into()), &saved),
            Some(crate::push_action::Response::Done(_))
        ));
        assert_eq!(session.restore(Some("account-a".into()), &saved), None);
        let mut replacement = PushSession::default();
        assert_eq!(replacement.response(&saved, payload, true), None);
        assert_eq!(replacement.restore(Some("account-b".into()), &saved), None);
        assert_eq!(replacement.restore(Some("account-a".into()), &saved), None);
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("push.json");
        saved.save(&path).unwrap();
        assert_eq!(
            PushState::load(&path).unwrap().language.as_deref(),
            Some("pt-BR")
        );
    }

    #[test]
    fn failed_revoke_pauses_delivery_and_keeps_the_endpoint_for_retry_after_restart() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("push.json");
        let mut saved = PushState::load(&path).unwrap();
        let registration = saved
            .registration("abcd".into(), "org.useorbit.desktop", false)
            .unwrap();
        saved.stage("account-a".into(), registration.clone());
        saved
            .commit("account-a".into(), registration.clone())
            .unwrap();
        let mut session = PushSession::default();
        session.restore(Some("account-a".into()), &saved);
        session.suspend(&mut saved, "account-a");
        assert!(!session.owns(&saved));
        saved.save(&path).unwrap();
        let saved = PushState::load(&path).unwrap();
        let mut restarted = PushSession::default();
        restarted.restore(Some("account-a".into()), &saved);
        assert!(!restarted.owns(&saved));
        assert_eq!(saved.owner, None);
        assert_eq!(saved.registration, None);
        assert_eq!(saved.pending.len(), 1);
        assert_eq!(saved.pending[0].owner, "account-a");
        assert_eq!(saved.pending[0].registration, registration);
        assert!(saved.pending[0].revoke);
    }

    #[test]
    fn a_stale_failed_revoke_keeps_the_replacement_account_active() {
        let directory = tempfile::tempdir().unwrap();
        let mut saved = PushState::load(&directory.path().join("push.json")).unwrap();
        let registration = saved
            .registration("abcd".into(), "org.useorbit.desktop", false)
            .unwrap();
        saved.stage("account-a".into(), registration.clone());
        saved.stage("account-b".into(), registration.clone());
        saved
            .commit("account-b".into(), registration.clone())
            .unwrap();
        let mut session = PushSession::default();
        session.restore(Some("account-b".into()), &saved);
        session.suspend(&mut saved, "account-a");
        assert!(session.owns(&saved));
        assert_eq!(saved.owner.as_deref(), Some("account-b"));
        assert_eq!(saved.registration, Some(registration));
        assert_eq!(saved.pending.len(), 1);
        assert!(saved.pending[0].revoke);
    }

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
                    reminder: crate::push_action::Reminder {
                        url: Some(url.into()),
                        ..Default::default()
                    }
                }
            );
            let apns = serde_json::json!({ "aps": { "alert": { "title": title, "body": body }, "sound": "default" }, "body": { "url": url } });
            assert_eq!(
                crate::push_action::apns_response(&apns.to_string(), false),
                Some(crate::push_action::Response::Open(Some(url.to_owned())))
            );
        }
        assert_eq!(
            crate::push_action::apns_response(
                r#"{"aps":{"alert":{"title":"Orbit","body":"Reminder"}},"body":{"url":null}}"#,
                false
            ),
            Some(crate::push_action::Response::Open(None))
        );
        assert!(serde_json::from_str::<RawNotice>(r#"{"title":123}"#).is_err());
        assert_eq!(crate::push_action::apns_response("invalid", false), None);
        let repeat = r#"{"body":{"url":"/","habitId":"11111111-1111-4111-8111-111111111111","doneToken":"one-use-token"}}"#;
        assert_eq!(
            crate::push_action::apns_response(repeat, false),
            Some(crate::push_action::Response::Open(Some(
                "/habits/11111111-1111-4111-8111-111111111111".into()
            )))
        );
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
        state.stage("account-a".into(), first.clone());
        state.stage("account-a".into(), first.clone());
        state.save(&path).unwrap();
        state = PushState::load(&path).unwrap();
        assert_eq!(state.pending.len(), 1);
        assert_eq!(state.pending[0].registration, first);
        state.commit("account-a".into(), first.clone()).unwrap();
        assert!(state.pending.is_empty());
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
            language: None,
            device_id: Uuid::new_v4(),
            owner: None,
            registration: None,
            pending: Vec::new(),
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
