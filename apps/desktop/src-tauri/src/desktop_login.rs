use crate::auth::{commit_session, cookie_owner, session_cookies, Attempt, AuthFlow};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager, Url, WebviewWindow};
use tauri_plugin_deep_link::DeepLinkExt;

pub type SharedAuth = Arc<Mutex<AuthFlow>>;

pub fn attach_callbacks(
    app: &AppHandle,
    flow: SharedAuth,
) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.clone();
    let running = flow.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            receive(&handle, running.clone(), url);
        }
    });
    if let Some(urls) = app.deep_link().get_current()? {
        for url in urls {
            receive(app, flow.clone(), url);
        }
    }
    Ok(())
}

pub fn start(app: AppHandle, flow: SharedAuth) {
    tauri::async_runtime::spawn(async move {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let origin = flow.lock().unwrap().origin.clone();
        let result = (|| {
            let (url, state) = {
                let mut guard = flow.lock().unwrap();
                let cookies = window
                    .cookies_for_url(origin.clone())
                    .map_err(|_| "Cannot read desktop session")?;
                let url = guard.begin(cookie_owner(&cookies))?;
                let state = url
                    .query_pairs()
                    .find(|(key, _)| key == "desktopState")
                    .unwrap()
                    .1
                    .into_owned();
                (url, state)
            };
            notify(&window, "begin", &state)?;
            tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
                .map_err(|_| "Cannot open sign-in browser")
        })();
        if result.is_err() {
            show_failure(&window, &origin);
        }
    });
}

fn dispatch_link(flow: SharedAuth, route: impl FnOnce(SharedAuth, Url) + Send + 'static) {
    tauri::async_runtime::spawn_blocking(move || {
        let origin = flow.lock().unwrap().origin.clone();
        route(flow, origin);
    });
}

fn receive(app: &AppHandle, flow: SharedAuth, url: Url) {
    let app = app.clone();
    dispatch_link(flow, move |flow, origin| {
        if let Some(destination) =
            crate::links::destination(&origin, &app.config().identifier, &url)
        {
            let result = crate::lifecycle::show_main(&app).and_then(|()| {
                if let Some(window) = app.get_webview_window("main") {
                    window.navigate(destination)?;
                }
                Ok(())
            });
            if let Err(error) = result {
                eprintln!("Cannot open desktop destination: {error}");
            }
            return;
        }
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let claimed = flow.lock().unwrap().claim(&url);
            let Some((attempt, code)) = claimed else {
                return;
            };
            if let Err(error) = crate::lifecycle::show_main(&handle) {
                eprintln!("Cannot restore sign-in window: {error}");
            }
            let Some(window) = handle.get_webview_window("main") else {
                return;
            };
            let origin = flow.lock().unwrap().origin.clone();
            if let Ok(current) = window.cookies_for_url(origin.clone()) {
                if !flow.lock().unwrap().accepts_session(&attempt, &current) {
                    return;
                }
            } else {
                show_failure(&window, &origin);
                return;
            }
            let result = match code {
                Some(code) => redeem(&window, &flow, &attempt, &code).await,
                None => Err("Desktop sign-in cancelled or expired"),
            };
            if result.is_err() && flow.lock().unwrap().owns(&attempt.state) {
                show_failure(&window, &origin);
            }
        });
    });
}

async fn redeem(
    window: &WebviewWindow,
    flow: &SharedAuth,
    attempt: &Attempt,
    code: &str,
) -> Result<(), &'static str> {
    let (origin, body) = {
        let guard = flow.lock().unwrap();
        (guard.origin.clone(), guard.exchange_body(attempt, code))
    };
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Cannot prepare desktop exchange")?;
    let response = client
        .post(origin.join("/api/auth/desktop/exchange").unwrap())
        .json(&body)
        .send()
        .await
        .map_err(|_| "Cannot reach desktop exchange")?;
    if !response.status().is_success() {
        return Err("Desktop exchange rejected");
    }
    let headers = response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .map(|header| {
            header
                .to_str()
                .map(str::to_owned)
                .map_err(|_| "Invalid session header")
        })
        .collect::<Result<Vec<_>, _>>()?;
    let cookies = session_cookies(&headers, &origin)?;
    {
        let mut guard = flow.lock().unwrap();
        if !guard.owns(&attempt.state) {
            return Ok(());
        }
        guard.ready = Some((attempt.clone(), cookies));
    }
    notify(window, "ready", &attempt.state)?;
    if let Err(error) = crate::lifecycle::show_main(window.app_handle()) {
        eprintln!("Cannot focus signed-in desktop: {error}");
    }
    Ok(())
}

fn notify(window: &WebviewWindow, phase: &str, state: &str) -> Result<(), &'static str> {
    let detail = serde_json::json!({ "phase": phase, "state": state });
    window
        .eval(format!(
            "window.dispatchEvent(new CustomEvent('orbit-desktop-auth', {{detail:{detail}}}))"
        ))
        .map_err(|_| "Cannot complete desktop sign-in")
}

#[tauri::command]
pub async fn commit_desktop_login(
    window: WebviewWindow,
    flow: tauri::State<'_, SharedAuth>,
    state: String,
) -> Result<bool, &'static str> {
    let (origin, ready) = {
        let mut guard = flow.lock().unwrap();
        let url = window.url().map_err(|_| "Cannot read desktop origin")?;
        if window.label() != "main" || url.origin() != guard.origin.origin() {
            return Err("Invalid desktop origin");
        }
        if !guard.owns(&state)
            || guard
                .ready
                .as_ref()
                .is_none_or(|(attempt, _)| attempt.state != state)
        {
            return Ok(false);
        }
        (guard.origin.clone(), guard.ready.take().unwrap())
    };
    commit_session(
        &flow,
        &ready.0,
        &ready.1,
        || window.cookies_for_url(origin),
        |cookie| window.set_cookie(cookie.clone()),
        |cookie| window.delete_cookie(cookie.clone()),
    )
}

fn show_failure(window: &WebviewWindow, origin: &Url) {
    if window
        .navigate(
            origin
                .join("/auth-callback?error=desktop_sign_in_failed")
                .unwrap(),
        )
        .is_err()
    {
        eprintln!("Cannot show desktop sign-in failure");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn url_callback_returns_before_a_queued_cookie_read_is_serviced() {
        let mut auth = AuthFlow::new(
            "https://app-staging.useorbit.org/".parse().unwrap(),
            "org.useorbit.desktop.staging",
        )
        .unwrap();
        let browser = auth.begin(Vec::new()).unwrap();
        let state = browser
            .query_pairs()
            .find(|(key, _)| key == "desktopState")
            .unwrap()
            .1
            .into_owned();
        let callback = format!(
            "org.useorbit.desktop.staging://auth/callback?state={state}&code={}",
            "A".repeat(64)
        )
        .parse()
        .unwrap();
        let (attempt, _) = auth.claim(&callback).unwrap();
        let flow = Arc::new(Mutex::new(auth));
        let (queued, cookie_request) = mpsc::channel();
        let (reply, cookie_reply) = mpsc::channel();
        let rescue = reply.clone();
        let worker_flow = flow.clone();
        let worker = std::thread::spawn(move || {
            commit_session(
                &worker_flow,
                &attempt,
                &[],
                || {
                    queued.send(()).unwrap();
                    cookie_reply
                        .recv_timeout(Duration::from_secs(5))
                        .map(|()| Vec::new())
                },
                |_| Ok(()),
                |_| Ok(()),
            )
        });
        cookie_request.recv_timeout(Duration::from_secs(5)).unwrap();
        let (returned, callback_returned) = mpsc::channel();
        let (routed, destination) = mpsc::channel();
        let event_loop = std::thread::spawn(move || {
            dispatch_link(flow, move |flow, origin| {
                let flow = flow.lock().unwrap();
                assert!(flow.owns(&state));
                let link = "org.useorbit.desktop.staging://app/calendar"
                    .parse()
                    .unwrap();
                routed
                    .send(crate::links::destination(
                        &origin,
                        "org.useorbit.desktop.staging",
                        &link,
                    ))
                    .unwrap();
            });
            returned.send(()).unwrap();
            let _ = reply.send(());
        });
        let responsive = callback_returned.recv_timeout(Duration::from_secs(1));
        if responsive.is_err() {
            let _ = rescue.send(());
        }
        event_loop.join().unwrap();
        assert_eq!(worker.join().unwrap(), Ok(true));
        assert!(
            responsive.is_ok(),
            "URL callback blocked event-loop progress while auth awaited a cookie read"
        );
        assert_eq!(
            destination.recv_timeout(Duration::from_secs(5)).unwrap(),
            Some("https://app-staging.useorbit.org/calendar".parse().unwrap())
        );
    }
}
