use crate::push_state::launch_path;
use crate::push_state::{PendingRegistration, PushSession, PushState, Registration};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{mpsc, Mutex, OnceLock},
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewWindow};

struct PushService {
    path: PathBuf,
    saved: Mutex<PushState>,
    session: Mutex<PushSession>,
    candidate: Mutex<Option<Registration>>,
    operation: Mutex<()>,
    response: Mutex<Option<mpsc::Sender<(i32, String)>>>,
    app: AppHandle,
}

static SERVICE: OnceLock<PushService> = OnceLock::new();

pub fn prepare_launch() {
    #[cfg(target_os = "macos")]
    assert!(
        unsafe { orbit_push_prepare_launch() },
        "Cannot observe desktop launch"
    );
}

pub fn notification_activation(_arguments: &[String]) -> bool {
    #[cfg(windows)]
    return crate::push_action::notification_activation(_arguments);
    #[cfg(not(windows))]
    false
}

pub fn notification_launch() -> bool {
    #[cfg(target_os = "macos")]
    return unsafe { orbit_push_notification_launch() };
    #[cfg(windows)]
    return notification_activation(&std::env::args().collect::<Vec<_>>());
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PushAction {
    Session,
    Status,
    Request,
    Stage,
    Commit,
    Clear,
    Suspend,
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
            session: Mutex::new(PushSession::default()),
            candidate: Mutex::new(None),
            operation: Mutex::new(()),
            response: Mutex::new(None),
            app: app.clone(),
        })
        .map_err(|_| "Push service already initialized")?;
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_init(receive);
        let language = SERVICE
            .get()
            .unwrap()
            .saved
            .lock()
            .unwrap()
            .language
            .clone();
        register_category(
            language
                .as_deref()
                .unwrap_or(&sys_locale::get_locale().unwrap_or_default()),
        )?;
    }
    #[cfg(windows)]
    if notification_launch() {
        tauri::async_runtime::spawn_blocking(|| {
            let service = SERVICE.get().unwrap();
            let _operation = service.operation.lock().unwrap();
            if let Err(error) = crate::push_windows::initialize(&service.app, receive)
                .and_then(|()| crate::push_windows::activate())
            {
                eprintln!("Cannot handle desktop notification launch: {error}");
                let app = service.app.clone();
                if let Err(error) = service.app.run_on_main_thread(move || {
                    if let Err(error) = crate::lifecycle::show_main(&app) {
                        eprintln!("Cannot restore desktop window: {error}");
                    }
                }) {
                    eprintln!("Cannot schedule desktop window restoration: {error}");
                }
            }
        });
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
    language: Option<String>,
) -> Result<Snapshot, String> {
    check_origin(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(language) = language {
            set_language(&language)?;
        }
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
    if matches!(action, PushAction::Suspend) {
        change_registration(service, &action, account, endpoint)?;
        return Ok(snapshot(service, "default"));
    }
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
    Ok(snapshot(service, permission))
}

fn snapshot(service: &PushService, permission: &'static str) -> Snapshot {
    let saved = service.saved.lock().unwrap();
    Snapshot {
        supported: permission != "unsupported",
        permission,
        owner: saved.owner.clone(),
        registration: saved.registration.clone(),
        candidate: service.candidate.lock().unwrap().clone(),
        pending: saved.pending.clone(),
    }
}

fn change_registration(
    service: &'static PushService,
    action: &PushAction,
    account: Option<String>,
    endpoint: Option<String>,
) -> Result<(), String> {
    match action {
        PushAction::Suspend => suspend_registration(service, account),
        PushAction::Session => restore_session(service, account),
        PushAction::Stage | PushAction::Commit => {
            persist_registration(service, action, account, endpoint)
        }
        PushAction::Clear => clear_registration(service, account),
        _ => Ok(()),
    }
}

fn suspend_registration(service: &PushService, account: Option<String>) -> Result<(), String> {
    let account = account.ok_or("Missing native push account")?;
    let mut session = service.session.lock().unwrap();
    let mut saved = service.saved.lock().unwrap();
    session.suspend(&mut saved, &account);
    #[cfg(target_os = "macos")]
    let enabled = session.owns(&saved);
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_set_active(enabled);
    }
    let persisted = saved.save(&service.path).map_err(|error| error.to_string());
    drop(saved);
    drop(session);
    #[cfg(target_os = "macos")]
    if !enabled && !unsafe { orbit_push_stop() } {
        return Err("Cannot pause native push registration".into());
    }
    persisted
}

fn restore_session(service: &'static PushService, account: Option<String>) -> Result<(), String> {
    let mut session = service.session.lock().unwrap();
    let saved = service.saved.lock().unwrap();
    let destination = session.restore(account, &saved);
    let enabled = session.owns(&saved);
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_set_active(enabled);
    }
    drop(saved);
    drop(session);
    if !enabled && !unsafe { orbit_push_stop() } {
        return Err("Cannot pause native push registration".into());
    }
    if let Some(response) = destination {
        dispatch_response(service, response);
    }
    Ok(())
}

fn persist_registration(
    service: &PushService,
    action: &PushAction,
    account: Option<String>,
    endpoint: Option<String>,
) -> Result<(), String> {
    let candidate = service
        .candidate
        .lock()
        .unwrap()
        .clone()
        .ok_or("Missing native registration")?;
    let session = service.session.lock().unwrap();
    if endpoint.as_deref() != Some(&candidate.endpoint)
        || account.as_ref().is_none_or(String::is_empty)
        || account != session.account
    {
        return Err("Invalid native registration commit".into());
    }
    let mut saved = service.saved.lock().unwrap();
    let mut next = saved.clone();
    let owner = account.unwrap();
    if matches!(action, PushAction::Stage) {
        next.stage(owner, candidate);
    } else {
        next.commit(owner, candidate)?;
    }
    next.save(&service.path)
        .map_err(|error| error.to_string())?;
    *saved = next;
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_set_active(session.owns(&saved) && saved.pending.is_empty());
    }
    Ok(())
}

fn clear_registration(service: &PushService, account: Option<String>) -> Result<(), String> {
    let session = service.session.lock().unwrap();
    let mut saved = service.saved.lock().unwrap();
    let mut next = saved.clone();
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
    next.save(&service.path)
        .map_err(|error| error.to_string())?;
    *saved = next;
    let enabled = session.owns(&saved);
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_set_active(enabled);
    }
    drop(saved);
    drop(session);
    if !enabled {
        *service.candidate.lock().unwrap() = None;
        if !unsafe { orbit_push_stop() } {
            return Err("Cannot stop native push registration".into());
        }
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
    } else if kind == 6 || kind == 8 {
        #[cfg(target_os = "macos")]
        {
            let destination = service.session.lock().unwrap().response(
                &service.saved.lock().unwrap(),
                &payload,
                kind == 8,
            );
            if let Some(response) = destination {
                dispatch_response(service, response);
            }
        }
        #[cfg(windows)]
        {
            let destination = service.session.lock().unwrap().windows_response(
                &service.saved.lock().unwrap(),
                &payload,
                kind == 8,
            );
            if let Some(response) = destination {
                dispatch_response(service, response);
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
        let Some(owner) = service.saved.lock().unwrap().owner.clone() else {
            return;
        };
        let language = service
            .saved
            .lock()
            .unwrap()
            .language
            .clone()
            .unwrap_or_else(|| "en".into());
        let labels = crate::localization::Labels::new(&language);
        if let Err(error) = crate::push_windows::show(&payload, owner, &labels) {
            eprintln!("Cannot show desktop reminder: {error}");
        }
    }
    let _ = payload;
    refresh(service, false);
}

fn refresh(service: &PushService, completed: bool) {
    if let Some(window) = service.app.get_webview_window("main") {
        if check_origin(&window).is_ok() {
            if let Err(error) = window.eval(if completed {
                "window.dispatchEvent(new CustomEvent('orbit-desktop-reminder-done'))"
            } else {
                "window.dispatchEvent(new CustomEvent('orbit-desktop-push'))"
            }) {
                eprintln!("Cannot refresh desktop notifications: {error}");
            }
        }
    }
}

fn set_language(language: &str) -> Result<(), String> {
    let service = SERVICE.get().ok_or("Push service unavailable")?;
    let mut saved = service.saved.lock().unwrap();
    if saved.language.as_deref() == Some(language) {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    register_category(language)?;
    let mut next = saved.clone();
    next.language = Some(language.into());
    next.save(&service.path)
        .map_err(|error| error.to_string())?;
    *saved = next;
    Ok(())
}

#[cfg(target_os = "macos")]
fn register_category(language: &str) -> Result<(), String> {
    let labels = crate::localization::Labels::new(language);
    let title =
        std::ffi::CString::new(labels.text("reminderDone")).map_err(|error| error.to_string())?;
    unsafe {
        orbit_push_category(title.as_ptr());
    }
    Ok(())
}

fn dispatch_response(service: &'static PushService, response: crate::push_action::Response) {
    let Some(owner) = service.saved.lock().unwrap().owner.clone() else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        if !owns_session(service) || service.saved.lock().unwrap().owner.as_deref() != Some(&owner)
        {
            return;
        }
        let destination = crate::push_action::resolve(response, |token| async move {
            let tauri::utils::config::WebviewUrl::External(origin) =
                &service.app.config().app.windows[0].url
            else {
                return false;
            };
            let result = match crate::push_action::done_request(origin, &token) {
                Ok(request) => request
                    .send()
                    .await
                    .map(|response| response.status().is_success()),
                Err(error) => Err(error),
            };
            match result {
                Ok(accepted) => accepted,
                Err(_) => {
                    eprintln!("Cannot complete desktop reminder");
                    false
                }
            }
        })
        .await;
        if owns_session(service) && service.saved.lock().unwrap().owner.as_deref() == Some(&owner) {
            if let Some(url) = destination {
                open(&service.app, url.as_deref());
            } else {
                refresh(service, true);
            }
        }
    });
}

fn owns_session(service: &PushService) -> bool {
    service
        .session
        .lock()
        .unwrap()
        .owns(&service.saved.lock().unwrap())
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
    fn orbit_push_prepare_launch() -> bool;
    #[cfg(target_os = "macos")]
    fn orbit_push_notification_launch() -> bool;
    #[cfg(target_os = "macos")]
    fn orbit_push_category(title: *const std::ffi::c_char);
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
