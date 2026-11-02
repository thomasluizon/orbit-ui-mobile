use crate::auth::{commit_session, cookie_owner, session_cookies, Attempt, AuthFlow};
use crate::locks::RecoverLock;
use std::{
    sync::{Arc, Mutex, OnceLock},
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
        if let Err(error) = crate::lifecycle::show_main(&app) {
            eprintln!("Cannot restore sign-in window: {error}");
        }
        let Some(window) = app.get_webview_window("main") else {
            eprintln!("Desktop sign-in: main window unavailable");
            return;
        };
        let origin = flow.recover_lock().origin.clone();
        let result = (|| {
            let (url, state) = {
                let mut guard = flow.recover_lock();
                let cookies = window
                    .cookies_for_url(origin.clone())
                    .map_err(|_| "Cannot read desktop session")?;
                guard.begin(cookie_owner(&cookies))?
            };
            notify(&window, "begin", &state)?;
            tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
                .map_err(|_| "Cannot open sign-in browser")
        })();
        if result.is_err() {
            flow.recover_lock().ready = None;
            eprintln!("Desktop sign-in: browser handoff failed");
            show_failure(&window, &origin);
        }
    });
}

fn dispatch_link(flow: SharedAuth, route: impl FnOnce(SharedAuth, Url) + Send + 'static) {
    tauri::async_runtime::spawn_blocking(move || {
        let origin = flow.recover_lock().origin.clone();
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
            let claimed = flow.recover_lock().claim(&url);
            let Some((attempt, code)) = claimed else {
                return;
            };
            if let Err(error) = crate::lifecycle::show_main(&handle) {
                eprintln!("Cannot restore sign-in window: {error}");
            }
            let Some(window) = handle.get_webview_window("main") else {
                return;
            };
            let origin = flow.recover_lock().origin.clone();
            let current = window
                .cookies_for_url(origin.clone())
                .map_err(|_| "Cannot read desktop session");
            drop(
                handle_callback(
                    &flow,
                    &attempt,
                    current,
                    || async {
                        match code {
                            Some(code) => redeem(&window, &flow, &attempt, &code).await,
                            None => Err("Desktop sign-in cancelled or expired".into()),
                        }
                    },
                    || show_failure(&window, &origin),
                )
                .await,
            );
        });
    });
}

async fn handle_callback<F: std::future::Future<Output = Result<(), String>>>(
    flow: &SharedAuth,
    attempt: &Attempt,
    current: Result<Vec<tauri::webview::Cookie<'static>>, &'static str>,
    redeem: impl FnOnce() -> F,
    failure: impl FnOnce(),
) -> Result<(), String> {
    let result = match current {
        Ok(current) => {
            if !flow.recover_lock().accepts_session(attempt, &current) {
                return Ok(());
            }
            redeem().await
        }
        Err(error) => Err(error.into()),
    };
    if result.is_err() {
        let owned = {
            let mut guard = flow.recover_lock();
            let owned = guard.owns(&attempt.state);
            if owned {
                guard.ready = None;
            }
            owned
        };
        if owned {
            eprintln!("Desktop sign-in: exchange or callback failed");
            failure();
        }
    }
    result
}

static EXCHANGE_CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();

fn exchange_client() -> Result<&'static reqwest::Client, String> {
    EXCHANGE_CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .https_only(true)
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|error| format!("Cannot prepare desktop exchange: {error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

fn exchange_headers(
    status: reqwest::StatusCode,
    headers: &reqwest::header::HeaderMap,
) -> Result<Vec<String>, String> {
    if !status.is_success() {
        return Err("Desktop exchange rejected".into());
    }
    headers
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .map(|header| {
            header
                .to_str()
                .map(str::to_owned)
                .map_err(|error| format!("Invalid session header: {error}"))
        })
        .collect()
}

async fn redeem(
    window: &WebviewWindow,
    flow: &SharedAuth,
    attempt: &Attempt,
    code: &str,
) -> Result<(), String> {
    let (origin, body) = {
        let guard = flow.recover_lock();
        (guard.origin.clone(), guard.exchange_body(attempt, code))
    };
    let response = exchange_client()?
        .post(
            origin
                .join("/api/auth/desktop/exchange")
                .map_err(|error| error.to_string())?,
        )
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Cannot reach desktop exchange: {}", error.without_url()))?;
    let headers = exchange_headers(response.status(), response.headers())?;
    let cookies = session_cookies(&headers, &origin)?;
    publish_ready(flow, attempt, cookies, || {
        notify(window, "ready", &attempt.state).map_err(str::to_owned)?;
        crate::lifecycle::show_main(window.app_handle())
            .map_err(|error| format!("Cannot focus signed-in desktop: {error}"))
    })
}

fn publish_ready(
    flow: &SharedAuth,
    attempt: &Attempt,
    cookies: Vec<tauri::webview::Cookie<'static>>,
    notify: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    {
        let mut guard = flow.recover_lock();
        if !guard.owns(&attempt.state) {
            return Ok(());
        }
        guard.ready = Some((attempt.clone(), cookies));
    }
    let result = notify();
    if result.is_err() {
        let mut guard = flow.recover_lock();
        if guard.owns(&attempt.state) {
            guard.ready = None;
        }
    }
    result
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
    let url = window.url().map_err(|_| "Cannot read desktop origin")?;
    commit_login(&window, &flow, &state, window.label(), &url)
}

trait CookieStore {
    fn read(&self, origin: &Url) -> Result<Vec<tauri::webview::Cookie<'static>>, String>;
    fn set(&self, cookie: &tauri::webview::Cookie<'static>) -> Result<(), String>;
    fn delete(&self, cookie: &tauri::webview::Cookie<'static>) -> Result<(), String>;
}

impl CookieStore for WebviewWindow {
    fn read(&self, origin: &Url) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
        self.cookies_for_url(origin.clone())
            .map_err(|error| error.to_string())
    }
    fn set(&self, cookie: &tauri::webview::Cookie<'static>) -> Result<(), String> {
        self.set_cookie(cookie.clone())
            .map_err(|error| error.to_string())
    }
    fn delete(&self, cookie: &tauri::webview::Cookie<'static>) -> Result<(), String> {
        self.delete_cookie(cookie.clone())
            .map_err(|error| error.to_string())
    }
}

fn commit_login(
    store: &impl CookieStore,
    flow: &SharedAuth,
    state: &str,
    label: &str,
    url: &Url,
) -> Result<bool, &'static str> {
    let (origin, ready) = {
        let mut guard = flow.recover_lock();
        if !crate::command_origin::allows(label, url, &guard.origin) {
            return Err("Invalid desktop origin");
        }
        if !guard.owns(state)
            || guard
                .ready
                .as_ref()
                .is_none_or(|(attempt, _)| attempt.state != state)
        {
            return Ok(false);
        }
        let Some(ready) = guard.ready.take() else {
            return Ok(false);
        };
        (guard.origin.clone(), ready)
    };
    commit_session(
        flow,
        &ready.0,
        &ready.1,
        || store.read(&origin),
        |cookie| store.set(cookie),
        |cookie| store.delete(cookie),
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

    fn claimed_flow() -> (SharedAuth, Attempt) {
        let mut auth = AuthFlow::new(
            "https://app-staging.useorbit.org/".parse().unwrap(),
            "org.useorbit.desktop.staging",
        )
        .unwrap();
        let (_, state) = auth.begin(Vec::new()).unwrap();
        let callback = format!(
            "org.useorbit.desktop.staging://auth/callback?state={state}&code={}",
            "A".repeat(64)
        )
        .parse()
        .unwrap();
        let (attempt, _) = auth.claim(&callback).unwrap();
        (Arc::new(Mutex::new(auth)), attempt)
    }

    fn cookie_headers() -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        for value in [
            "auth_token=session; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=strict",
            "refresh_token=refresh; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=strict",
        ] {
            headers.append(reqwest::header::SET_COOKIE, value.parse().unwrap());
        }
        headers
    }

    fn ready_cookies(flow: &SharedAuth) -> Vec<tauri::webview::Cookie<'static>> {
        session_cookies(
            &exchange_headers(reqwest::StatusCode::OK, &cookie_headers()).unwrap(),
            &flow.recover_lock().origin,
        )
        .unwrap()
    }

    #[derive(Default)]
    struct Store {
        writes: std::cell::RefCell<Vec<tauri::webview::Cookie<'static>>>,
    }
    impl CookieStore for Store {
        fn read(&self, _: &Url) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
            Ok(Vec::new())
        }
        fn set(&self, cookie: &tauri::webview::Cookie<'static>) -> Result<(), String> {
            self.writes.borrow_mut().push(cookie.clone());
            Ok(())
        }
        fn delete(&self, _: &tauri::webview::Cookie<'static>) -> Result<(), String> {
            panic!("unexpected rollback");
        }
    }

    #[test]
    fn exchange_refuses_non_success_and_forwards_every_cookie_header() {
        let headers = cookie_headers();
        assert_eq!(
            exchange_headers(reqwest::StatusCode::UNAUTHORIZED, &headers),
            Err("Desktop exchange rejected".into())
        );
        let forwarded = exchange_headers(reqwest::StatusCode::OK, &headers).unwrap();
        assert_eq!(forwarded.len(), 2);
        assert!(forwarded[0].starts_with("auth_token="));
        assert!(forwarded[1].starts_with("refresh_token="));
        let mut extra = headers;
        extra.append(reqwest::header::SET_COOKIE, "third=value".parse().unwrap());
        assert_eq!(
            exchange_headers(reqwest::StatusCode::OK, &extra)
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn exchange_reuses_an_https_only_client_without_redirects() {
        let client = exchange_client().unwrap();
        assert!(std::ptr::eq(client, exchange_client().unwrap()));
        assert!(format!("{client:?}").contains("redirect_policy: \"Policy(None)\""));
        let rejected =
            tauri::async_runtime::block_on(client.get("http://127.0.0.1:1/").send()).unwrap_err();
        assert!(rejected.is_builder());
    }

    #[test]
    fn cookie_commit_refuses_wrong_origins_and_stale_attempts_without_writes() {
        let (flow, attempt) = claimed_flow();
        let cookies = ready_cookies(&flow);
        publish_ready(&flow, &attempt, cookies, || Ok(())).unwrap();
        let store = Store::default();
        assert_eq!(
            commit_login(
                &store,
                &flow,
                &attempt.state,
                "main",
                &"https://example.com/".parse().unwrap()
            ),
            Err("Invalid desktop origin")
        );
        let origin = flow.recover_lock().origin.clone();
        assert_eq!(
            commit_login(&store, &flow, "stale", "main", &origin),
            Ok(false)
        );
        assert!(store.writes.borrow().is_empty());
        assert_eq!(
            commit_login(&store, &flow, &attempt.state, "main", &origin),
            Ok(true)
        );
        assert_eq!(store.writes.borrow().len(), 2);
        assert!(store
            .writes
            .borrow()
            .iter()
            .all(|cookie| cookie.domain().is_none()));
        assert_eq!(
            commit_login(&store, &flow, &attempt.state, "main", &origin),
            Ok(false)
        );
        assert_eq!(store.writes.borrow().len(), 2);
    }

    #[test]
    fn callback_owner_and_cookie_read_gate_the_exchange() {
        let (flow, attempt) = claimed_flow();
        let called = std::cell::Cell::new(false);
        let failed_page = std::cell::Cell::new(false);
        for (current, expected, redeemed) in [
            (Ok(ready_cookies(&flow)), Ok(()), false),
            (Ok(Vec::new()), Ok(()), true),
            (
                Err("Cannot read desktop session"),
                Err("Cannot read desktop session".into()),
                false,
            ),
        ] {
            called.set(false);
            failed_page.set(false);
            let result = tauri::async_runtime::block_on(handle_callback(
                &flow,
                &attempt,
                current,
                || async {
                    called.set(true);
                    Ok(())
                },
                || failed_page.set(true),
            ));
            assert_eq!(failed_page.get(), expected.is_err());
            assert_eq!(result, expected);
            assert_eq!(called.get(), redeemed);
            assert!(flow.recover_lock().ready.is_none());
        }
    }

    #[test]
    fn failed_ready_notification_removes_session_values() {
        let (flow, attempt) = claimed_flow();
        let cookies = ready_cookies(&flow);
        assert_eq!(
            publish_ready(&flow, &attempt, cookies, || Err("notify failed".into())),
            Err("notify failed".into())
        );
        assert!(flow.recover_lock().ready.is_none());
    }

    #[test]
    fn url_callback_returns_before_a_queued_cookie_read_is_serviced() {
        let mut auth = AuthFlow::new(
            "https://app-staging.useorbit.org/".parse().unwrap(),
            "org.useorbit.desktop.staging",
        )
        .unwrap();
        let (_, state) = auth.begin(Vec::new()).unwrap();
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
                let flow = flow.recover_lock();
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
