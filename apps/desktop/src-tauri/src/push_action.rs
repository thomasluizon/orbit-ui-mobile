use serde::{Deserialize, Serialize};
use std::{future::Future, time::Duration};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub url: Option<String>,
    pub habit_id: Option<uuid::Uuid>,
    pub done_token: Option<String>,
    pub done_label: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum Response {
    Open(Option<String>),
    Done(Reminder),
}

#[cfg(any(windows, test))]
#[derive(Deserialize, Serialize)]
pub struct WindowsNotice {
    pub owner: String,
    pub reminder: Reminder,
}

#[cfg(any(windows, test))]
pub fn notification_activation(arguments: &[String]) -> bool {
    arguments
        .iter()
        .any(|argument| argument == "----AppNotificationActivated:")
}

impl Reminder {
    pub fn destination(&self) -> Option<String> {
        self.habit_id
            .map(|id| format!("/habits/{id}"))
            .or_else(|| self.url.clone())
    }

    pub fn response(self, done: bool) -> Response {
        if done {
            Response::Done(self)
        } else {
            Response::Open(self.destination())
        }
    }
}

#[cfg(any(target_os = "macos", test))]
pub fn apns_response(payload: &str, done: bool) -> Option<Response> {
    #[derive(Deserialize)]
    struct Payload {
        body: Reminder,
    }
    serde_json::from_str::<Payload>(payload)
        .ok()
        .map(|payload| payload.body.response(done))
}

pub fn done_request(
    origin: &tauri::Url,
    token: &str,
) -> Result<reqwest::RequestBuilder, reqwest::Error> {
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()?;
    Ok(client
        .post(origin.join("/api/reminders/done").unwrap())
        .json(&serde_json::json!({ "token": token })))
}

pub async fn resolve<F: Future<Output = bool>>(
    response: Response,
    complete: impl FnOnce(String) -> F,
) -> Option<Option<String>> {
    match response {
        Response::Open(url) => Some(url),
        Response::Done(reminder) => {
            let destination = reminder.destination();
            match reminder.done_token.filter(|token| !token.is_empty()) {
                Some(token) => {
                    if complete(token).await {
                        None
                    } else {
                        Some(destination)
                    }
                }
                None => Some(destination),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HABIT: &str = "11111111-1111-4111-8111-111111111111";

    fn repeat() -> Reminder {
        // WHY: Fields follow ReminderSchedulerService.Repeat.cs RecordRepeat and PushNotificationService.cs CreateWebPushPayload in orbit-api (#1861).
        serde_json::from_value(serde_json::json!({
            "habitId": HABIT, "url": "/", "doneToken": "one-use-token", "doneLabel": "Concluir",
            "tag": "orbit-repeat-11111111111141118111111111111111",
            "reminderAtUtc": "2026-10-29T12:00:00Z", "doneExpiresAtUtc": "2026-10-29T13:00:00Z"
        }))
        .unwrap()
    }

    #[test]
    fn apns_and_raw_body_clicks_open_the_habit_without_completing_it() {
        let apns = format!(
            r#"{{"aps":{{"category":"orbit-repeat-reminder"}},"body":{{"habitId":"{HABIT}","url":"/","doneToken":"one-use-token"}}}}"#
        );
        let expected = Response::Open(Some(format!("/habits/{HABIT}")));
        assert_eq!(apns_response(&apns, false), Some(expected));
        let destination =
            tauri::async_runtime::block_on(resolve(repeat().response(false), |_| async {
                panic!("body click must not post")
            }));
        assert_eq!(destination, Some(Some(format!("/habits/{HABIT}"))));
        assert!(matches!(
            apns_response(&apns, true),
            Some(Response::Done(_))
        ));
        assert_eq!(apns_response("invalid", true), None);
    }

    #[test]
    fn done_posts_once_and_keeps_the_window_hidden_on_success() {
        let mut calls = Vec::new();
        let destination =
            tauri::async_runtime::block_on(resolve(repeat().response(true), |token| {
                calls.push(token);
                async { true }
            }));
        assert_eq!(calls, ["one-use-token"]);
        assert_eq!(destination, None);
    }

    #[test]
    fn rejected_offline_and_missing_token_done_open_the_habit() {
        for token in [Some("one-use-token".into()), None, Some(String::new())] {
            let mut reminder = repeat();
            reminder.done_token = token;
            let destination =
                tauri::async_runtime::block_on(resolve(reminder.response(true), |_| async {
                    false
                }));
            assert_eq!(destination, Some(Some(format!("/habits/{HABIT}"))));
        }
    }

    #[test]
    fn done_request_uses_only_the_token_and_configured_environment() {
        for hostname in ["app-staging.useorbit.org", "app.useorbit.org"] {
            let origin = format!("https://{hostname}/").parse().unwrap();
            let request = done_request(&origin, "one-use-token")
                .unwrap()
                .build()
                .unwrap();
            assert_eq!(request.method(), reqwest::Method::POST);
            assert_eq!(
                request.url().as_str(),
                format!("https://{hostname}/api/reminders/done")
            );
            assert!(!request.headers().contains_key("authorization"));
            assert!(!request.headers().contains_key("cookie"));
            assert_eq!(
                request.body().unwrap().as_bytes().unwrap(),
                br#"{"token":"one-use-token"}"#
            );
        }
    }

    #[test]
    fn only_the_windows_sdk_toast_activation_defers_startup_visibility() {
        for (arguments, expected) in [
            (vec!["Orbit.exe", "----AppNotificationActivated:"], true),
            (vec!["Orbit.exe"], false),
            (vec!["Orbit.exe", "--autostart"], false),
            (vec!["Orbit.exe", "org.useorbit.desktop://habits"], false),
        ] {
            assert_eq!(
                notification_activation(
                    &arguments.into_iter().map(String::from).collect::<Vec<_>>()
                ),
                expected
            );
        }
    }
}
