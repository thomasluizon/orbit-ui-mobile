use crate::push_state::launch_path;
use crate::push_state::{PendingRegistration, PushState, Registration};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{mpsc, Mutex, OnceLock},
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(windows)]
type ShownNotifications = std::collections::HashMap<i32, (String, Option<String>)>;

struct PushService {
    path: PathBuf,
    saved: Mutex<PushState>,
    account: Mutex<Option<String>>,
    candidate: Mutex<Option<Registration>>,
    operation: Mutex<()>,
    response: Mutex<Option<mpsc::Sender<(i32, String)>>>,
    app: AppHandle,
    #[cfg(windows)]
    shown: Mutex<ShownNotifications>,
}

static SERVICE: OnceLock<PushService> = OnceLock::new();

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PushAction {
    Session,
    Status,
    Request,
    Stage,
    Commit,
    Clear,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    supported: bool,
    permission: &'static str,
    owner: Option<String>,
    registration: Option<Registration>,
    candidate: Option<Registration>,
    pending: Vec<PendingRegistration>,
}

pub fn start(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let path = app.path().app_data_dir()?.join("push.json");
    let saved = PushState::load(&path).map_err(|error| error.to_string())?;
    SERVICE
        .set(PushService {
            path,
            saved: Mutex::new(saved),
            account: Mutex::new(None),
            candidate: Mutex::new(None),
            operation: Mutex::new(()),
            response: Mutex::new(None),
            app: app.clone(),
            #[cfg(windows)]
            shown: Mutex::new(std::collections::HashMap::new()),
        })
        .map_err(|_| "Push service already initialized")?;
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_init(receive);
    }
    Ok(())
}

fn check_origin(window: &WebviewWindow) -> Result<(), String> {
    let tauri::utils::config::WebviewUrl::External(origin) =
        &window.app_handle().config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    if window.label() != "main"
        || window.url().map_err(|error| error.to_string())?.origin() != origin.origin()
    {
        return Err("Invalid desktop push origin".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn desktop_push(
    window: WebviewWindow,
    action: PushAction,
    account_id: Option<String>,
    endpoint: Option<String>,
    prompt: Option<bool>,
) -> Result<Snapshot, String> {
    check_origin(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        operate(action, account_id, endpoint, prompt.unwrap_or(false))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn operate(
    action: PushAction,
    account: Option<String>,
    endpoint: Option<String>,
    prompt: bool,
) -> Result<Snapshot, String> {
    let service = SERVICE.get().ok_or("Push service unavailable")?;
    let _operation = service.operation.lock().unwrap();
    change_registration(service, &action, account, endpoint)?;
    let token = matches!(action, PushAction::Request);
    let (sender, receiver) = mpsc::channel();
    *service.response.lock().unwrap() = Some(sender);
    let received = native_request(service, prompt, token)
        .and_then(|()| wait_for_registration(&receiver, token));
    service.response.lock().unwrap().take();
    let (permission, candidate) = received?;
    if let Some(endpoint) = candidate {
        let registration = service.saved.lock().unwrap().registration(
            endpoint,
            &service.app.config().identifier,
            cfg!(windows),
        )?;
        *service.candidate.lock().unwrap() = Some(registration);
    }
    let saved = service.saved.lock().unwrap();
    Ok(Snapshot {
        supported: permission != "unsupported",
        permission,
        owner: saved.owner.clone(),
        registration: saved.registration.clone(),
        candidate: service.candidate.lock().unwrap().clone(),
        pending: saved.pending.clone(),
    })
}

fn change_registration(
    service: &PushService,
    action: &PushAction,
    account: Option<String>,
    endpoint: Option<String>,
) -> Result<(), String> {
    match action {
        PushAction::Session => {
            *service.account.lock().unwrap() = account.clone();
            let enabled = account.is_some() && service.saved.lock().unwrap().owner == account;
            if !enabled && !unsafe { orbit_push_stop() } {
                return Err("Cannot pause native push registration".into());
            }
            #[cfg(target_os = "macos")]
            unsafe {
                orbit_push_set_active(enabled);
            }
        }
        PushAction::Stage | PushAction::Commit => {
            let candidate = service
                .candidate
                .lock()
                .unwrap()
                .clone()
                .ok_or("Missing native registration")?;
            if endpoint.as_deref() != Some(&candidate.endpoint)
                || account.as_ref().is_none_or(String::is_empty)
                || account != *service.account.lock().unwrap()
            {
                return Err("Invalid native registration commit".into());
            }
            let mut next = service.saved.lock().unwrap().clone();
            let owner = account.unwrap();
            if matches!(action, PushAction::Stage) {
                next.stage(owner, candidate);
            } else {
                next.commit(owner, candidate)?;
            }
            next.save(&service.path)
                .map_err(|error| error.to_string())?;
            #[cfg(target_os = "macos")]
            let enabled = next.owner == *service.account.lock().unwrap() && next.pending.is_empty();
            *service.saved.lock().unwrap() = next;
            #[cfg(target_os = "macos")]
            unsafe {
                orbit_push_set_active(enabled);
            }
        }
        PushAction::Clear => {
            let mut next = service.saved.lock().unwrap().clone();
            if account.is_none()
                || (next.owner != account
                    && !next
                        .pending
                        .iter()
                        .any(|pending| Some(&pending.owner) == account.as_ref()))
            {
                return Err("Native push account changed".into());
            }
            if next.owner == account {
                next.owner = None;
                next.registration = None;
            }
            next.pending
                .retain(|pending| Some(&pending.owner) != account.as_ref());
            if !unsafe { orbit_push_stop() } {
                return Err("Cannot stop native push registration".into());
            }
            next.save(&service.path)
                .map_err(|error| error.to_string())?;
            *service.saved.lock().unwrap() = next;
            #[cfg(target_os = "macos")]
            unsafe {
                orbit_push_set_active(false);
            }
            *service.candidate.lock().unwrap() = None;
            #[cfg(windows)]
            service.shown.lock().unwrap().clear();
        }
        _ => {}
    }
    Ok(())
}

fn wait_for_registration(
    receiver: &mpsc::Receiver<(i32, String)>,
    token: bool,
) -> Result<(&'static str, Option<String>), String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(310);
    loop {
        let (kind, payload) = receiver
            .recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
            .map_err(|_| "Native push request timed out")?;
        match kind {
            0 => return Ok(("unsupported", None)),
            1 => return Ok(("default", None)),
            2 if !token => return Ok(("granted", None)),
            3 => return Ok(("denied", None)),
            4 => return Ok(("granted", Some(payload))),
            7 => return Err("Native push request failed".into()),
            _ => {}
        }
    }
}

fn native_request(_service: &PushService, prompt: bool, token: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let object_id = option_env!("ORBIT_DESKTOP_WNS_OBJECT_ID").unwrap_or("");
        if object_id.is_empty() {
            receive_value(0, String::new());
            return Ok(());
        }
        uuid::Uuid::parse_str(object_id).map_err(|_| "Invalid WNS service principal object ID")?;
        crate::push_windows::initialize(&_service.app, receive)?;
    }
    unsafe {
        orbit_push_request(prompt, token);
    }
    Ok(())
}

extern "C" fn receive(kind: i32, bytes: *const u8, length: usize) {
    let payload = if length == 0 {
        String::new()
    } else {
        let bytes = unsafe { std::slice::from_raw_parts(bytes, length) };
        let Ok(payload) = std::str::from_utf8(bytes) else {
            return;
        };
        payload.to_owned()
    };
    receive_value(kind, payload);
}

fn receive_value(kind: i32, payload: String) {
    let Some(service) = SERVICE.get() else {
        return;
    };
    if kind == 5 {
        received_payload(service, &payload);
    } else if kind == 6 {
        #[cfg(target_os = "macos")]
        if owns_session(service) {
            open(
                &service.app,
                crate::push_state::apns_destination(&payload).as_deref(),
            );
        }
        #[cfg(windows)]
        if let Ok(id) = payload.parse::<i32>() {
            let notice = service.shown.lock().unwrap().remove(&id);
            if let Some((owner, url)) = notice {
                if owns_session(service)
                    && service.saved.lock().unwrap().owner.as_deref() == Some(&owner)
                {
                    open(&service.app, url.as_deref());
                }
            }
        }
    } else if let Some(sender) = service.response.lock().unwrap().as_ref() {
        let _ = sender.send((kind, payload));
    }
}

fn received_payload(service: &PushService, payload: &str) {
    if !owns_session(service) {
        return;
    }
    #[cfg(windows)]
    {
        let Ok(payload) = serde_json::from_str::<crate::push_state::RawNotice>(payload) else {
            return;
        };
        static NEXT_ID: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(1);
        let id = NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let Some(owner) = service.saved.lock().unwrap().owner.clone() else {
            return;
        };
        service
            .shown
            .lock()
            .unwrap()
            .insert(id, (owner, payload.url.clone()));
        if let Err(error) = crate::push_windows::show(&payload, id) {
            service.shown.lock().unwrap().remove(&id);
            eprintln!("Cannot show desktop reminder: {error}");
        }
    }
    let _ = payload;
    if let Some(window) = service.app.get_webview_window("main") {
        if check_origin(&window).is_ok() {
            if let Err(error) =
                window.eval("window.dispatchEvent(new CustomEvent('orbit-desktop-push'))")
            {
                eprintln!("Cannot refresh desktop notifications: {error}");
            }
        }
    }
}

fn owns_session(service: &PushService) -> bool {
    let account = service.account.lock().unwrap().clone();
    account.is_some() && account == service.saved.lock().unwrap().owner
}

fn open(app: &AppHandle, url: Option<&str>) {
    let result = match url {
        Some(url) => crate::lifecycle::navigate(app, &launch_path(Some(url))),
        None => crate::lifecycle::show_main(app).map_err(Into::into),
    };
    if let Err(error) = result {
        eprintln!("Cannot open desktop reminder: {error}");
    }
}

unsafe extern "C" {
    #[cfg(target_os = "macos")]
    fn orbit_push_init(callback: extern "C" fn(i32, *const u8, usize));
    fn orbit_push_request(prompt: bool, token: bool);
    fn orbit_push_stop() -> bool;
    #[cfg(target_os = "macos")]
    fn orbit_push_set_active(active: bool);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn granted_permission_is_not_a_registration_until_the_native_token_arrives() {
        let (sender, receiver) = mpsc::channel();
        sender.send((2, String::new())).unwrap();
        sender.send((4, "device-token".into())).unwrap();
        assert_eq!(
            wait_for_registration(&receiver, true).unwrap(),
            ("granted", Some("device-token".into()))
        );
    }

    #[test]
    fn disabled_denied_and_failed_requests_never_report_a_subscription() {
        for (kind, permission) in [(0, "unsupported"), (1, "default"), (3, "denied")] {
            let (sender, receiver) = mpsc::channel();
            sender.send((kind, String::new())).unwrap();
            assert_eq!(
                wait_for_registration(&receiver, true).unwrap(),
                (permission, None)
            );
        }
        let (sender, receiver) = mpsc::channel();
        sender.send((7, String::new())).unwrap();
        assert!(wait_for_registration(&receiver, true).is_err());
    }
}
