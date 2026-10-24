use crate::auth::{cookie_owner, session_cookies, Attempt, AuthFlow};
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
            let cookies = window
                .cookies_for_url(origin.clone())
                .map_err(|_| "Cannot read desktop session")?;
            let url = flow.lock().unwrap().begin(cookie_owner(&cookies))?;
            tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
                .map_err(|_| "Cannot open sign-in browser")?;
            window
                .navigate(origin.join("/login").unwrap())
                .map_err(|_| "Cannot reset desktop login")
        })();
        if result.is_err() {
            show_failure(&window, &origin);
        }
    });
}

fn receive(app: &AppHandle, flow: SharedAuth, url: Url) {
    let claimed = flow.lock().unwrap().claim(&url);
    let Some((attempt, code)) = claimed else {
        return;
    };
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
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
    let current = window
        .cookies_for_url(origin.clone())
        .map_err(|_| "Cannot read desktop session")?;
    if !flow.lock().unwrap().accepts_session(attempt, &current) {
        return Ok(());
    }
    for cookie in cookies {
        window
            .set_cookie(cookie)
            .map_err(|_| "Cannot install desktop session")?;
    }
    window
        .navigate(origin)
        .map_err(|_| "Cannot open signed-in desktop")?;
    window
        .set_focus()
        .map_err(|_| "Cannot focus signed-in desktop")
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
