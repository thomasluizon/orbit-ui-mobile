use crate::locks::RecoverLock;
use crate::push_state::launch_path;
use crate::push_state::{PendingRegistration, PushSession, PushState, Registration};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{mpsc, Mutex, OnceLock},
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewWindow};

const UNSUPPORTED: i32 = 0;
const DEFAULT: i32 = 1;
const GRANTED: i32 = 2;
const DENIED: i32 = 3;
const REGISTRATION: i32 = 4;
const NOTICE: i32 = 5;
const OPEN: i32 = 6;
const FAILED: i32 = 7;
const DONE: i32 = 8;

struct RegistrationWaiter {
    sender: mpsc::SyncSender<(i32, String)>,
    token: bool,
}

struct PushService {
    path: PathBuf,
    saved: Mutex<PushState>,
    session: Mutex<PushSession>,
    candidate: Mutex<Option<Registration>>,
    operation: Mutex<()>,
    persistence: Mutex<()>,
    permission: Mutex<&'static str>,
    refresh: Mutex<Refresh>,
    response: Mutex<Option<RegistrationWaiter>>,
    app: AppHandle,
}

static SERVICE: OnceLock<PushService> = OnceLock::new();

pub fn prepare_launch() -> Result<(), &'static str> {
    #[cfg(target_os = "macos")]
    if !unsafe { orbit_push_prepare_launch() } {
        return Err("Native launch observer unavailable");
    }
    Ok(())
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

pub fn page_loaded(window: &WebviewWindow, payload: tauri::webview::PageLoadPayload<'_>) {
    let Some(service) = SERVICE.get() else {
        return;
    };
    let tauri::utils::config::WebviewUrl::External(origin) =
        &service.app.config().app.windows[0].url
    else {
        return;
    };
    if let Err(error) = crate::lifecycle::notification_page_loaded(
        notification_launch(),
        origin,
        payload.url(),
        payload.event(),
        &mut service.session.recover_lock(),
        || crate::lifecycle::show_main(window.app_handle()),
    ) {
        eprintln!("Cannot show desktop sign-in window: {error}");
    }
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
            persistence: Mutex::new(()),
            permission: Mutex::new("default"),
            refresh: Mutex::new(Refresh::default()),
            response: Mutex::new(None),
            app: app.clone(),
        })
        .map_err(|_| "Push service already initialized")?;
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_init(receive);
        let language = SERVICE.get().unwrap().saved.recover_lock().language.clone();
        register_category(
            language
                .as_deref()
                .unwrap_or(&sys_locale::get_locale().unwrap_or_default()),
        )?;
    }
    #[cfg(windows)]
    recover_windows_launch();
    tauri::async_runtime::spawn_blocking(|| {
        let service = SERVICE
            .get()
            .expect("push service initialized before permission lookup");
        if let Err(error) = request_registration(service, false, false) {
            eprintln!("Desktop push: cannot refresh native permission: {error}");
        }
        refresh(service, false);
    });
    Ok(())
}

#[cfg(windows)]
fn recover_windows_launch() {
    if notification_launch() {
        tauri::async_runtime::spawn_blocking(|| {
            let service = SERVICE.get().unwrap();
            let _operation = service.operation.recover_lock();
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
}

fn check_origin(window: &WebviewWindow) -> Result<(), String> {
    let tauri::utils::config::WebviewUrl::External(origin) =
        &window.app_handle().config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    let url = window.url().map_err(|error| error.to_string())?;
    if !crate::command_origin::allows(window.label(), &url, origin) {
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
    if let Some(language) = &language {
        validate_language(language)?;
    }
    if matches!(action, PushAction::Status) && language.is_none() {
        return Ok(snapshot(SERVICE.get().ok_or("Push service unavailable")?));
    }
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
    if !matches!(action, PushAction::Request) {
        change_registration(service, &action, account, endpoint)?;
        return Ok(snapshot(service));
    }
    request_registration(service, prompt, true)?;
    Ok(snapshot(service))
}

fn request_registration(service: &PushService, prompt: bool, token: bool) -> Result<(), String> {
    let _operation = request_operation(&service.operation)?;
    let account_before_request = service.session.recover_lock().account.clone();
    let (sender, receiver) = mpsc::sync_channel(8);
    *service.response.recover_lock() = Some(RegistrationWaiter { sender, token });
    let received = native_request(service, prompt, token)
        .and_then(|()| wait_for_registration(&receiver, token));
    service.response.recover_lock().take();
    let (permission, candidate) = received?;
    if service.session.recover_lock().account != account_before_request {
        stop_inactive(false)?;
        return Err("Native push account changed during request".into());
    }
    *service.permission.recover_lock() = permission;
    if let Some(endpoint) = candidate {
        let registration = service.saved.recover_lock().registration(
            endpoint,
            &service.app.config().identifier,
            cfg!(windows),
        )?;
        *service.candidate.recover_lock() = Some(registration);
    }
    Ok(())
}

fn request_operation(operation: &Mutex<()>) -> Result<std::sync::MutexGuard<'_, ()>, String> {
    match operation.try_lock() {
        Ok(guard) => Ok(guard),
        Err(std::sync::TryLockError::WouldBlock) => {
            Err("Native push request already in progress".into())
        }
        Err(std::sync::TryLockError::Poisoned(poisoned)) => {
            eprintln!("Desktop push: recovering a poisoned request lock");
            Ok(poisoned.into_inner())
        }
    }
}

fn snapshot(service: &PushService) -> Snapshot {
    cached_snapshot(&service.saved, &service.permission, &service.candidate)
}

fn cached_snapshot(
    saved: &Mutex<PushState>,
    permission: &Mutex<&'static str>,
    candidate: &Mutex<Option<Registration>>,
) -> Snapshot {
    let permission = *permission.recover_lock();
    let saved = saved.recover_lock();
    Snapshot {
        supported: permission != "unsupported",
        permission,
        owner: saved.owner.clone(),
        registration: saved.registration.clone(),
        candidate: candidate.recover_lock().clone(),
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

trait PushStore {
    fn save(&self, state: &PushState) -> Result<(), String>;
}

impl PushStore for PathBuf {
    fn save(&self, state: &PushState) -> Result<(), String> {
        state.save(self).map_err(|error| error.to_string())
    }
}

fn save_registration(
    saved: &Mutex<PushState>,
    store: &impl PushStore,
    change: impl FnOnce(&mut PushState) -> Result<(), String>,
) -> Result<(), String> {
    let mut next = saved.recover_lock().clone();
    change(&mut next)?;
    store.save(&next)?;
    *saved.recover_lock() = next;
    Ok(())
}

fn suspend_registration(service: &PushService, account: Option<String>) -> Result<(), String> {
    let account = account.ok_or("Missing native push account")?;
    let _persistence = service.persistence.recover_lock();
    suspend_with_store(
        &service.saved,
        &service.session,
        &account,
        &service.path,
        |enabled| {
            set_active(enabled);
            stop_inactive(enabled)
        },
    )
}

fn suspend_with_store(
    saved: &Mutex<PushState>,
    session: &Mutex<PushSession>,
    account: &str,
    store: &impl PushStore,
    stop: impl FnOnce(bool) -> Result<(), String>,
) -> Result<(), String> {
    let mut candidate_session = session.recover_lock().clone();
    save_registration(saved, store, |next| {
        candidate_session
            .suspend(next, account)
            .map_err(str::to_owned)
    })?;
    let enabled = {
        let mut session = session.recover_lock();
        let mut saved = saved.recover_lock();
        session.suspend(&mut saved, account)?;
        session.owns(&saved)
    };
    stop(enabled)
}

fn set_active(_enabled: bool) {
    #[cfg(target_os = "macos")]
    unsafe {
        orbit_push_set_active(_enabled);
    }
}

fn stop_inactive(enabled: bool) -> Result<(), String> {
    if !enabled && !unsafe { orbit_push_stop() } {
        return Err("Cannot pause native push registration".into());
    }
    Ok(())
}

fn restore_session(service: &'static PushService, account: Option<String>) -> Result<(), String> {
    let _persistence = service.persistence.recover_lock();
    let (destination, enabled) = {
        let mut session = service.session.recover_lock();
        let saved = service.saved.recover_lock();
        (session.restore(account, &saved), session.owns(&saved))
    };
    set_active(enabled);
    stop_inactive(enabled)?;
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
    let _persistence = service.persistence.recover_lock();
    let candidate = service
        .candidate
        .recover_lock()
        .clone()
        .ok_or("Missing native registration")?;
    let session = service.session.recover_lock().clone();
    persist_candidate(
        &service.saved,
        &service.path,
        &session,
        candidate,
        action,
        account,
        endpoint,
    )?;
    let saved = service.saved.recover_lock();
    set_active(session.owns(&saved) && saved.pending.is_empty());
    Ok(())
}

fn persist_candidate(
    saved: &Mutex<PushState>,
    store: &impl PushStore,
    session: &PushSession,
    candidate: Registration,
    action: &PushAction,
    account: Option<String>,
    endpoint: Option<String>,
) -> Result<(), String> {
    if endpoint.as_deref() != Some(&candidate.endpoint)
        || account.as_ref().is_none_or(String::is_empty)
        || account != session.account
    {
        return Err("Invalid native registration commit".into());
    }
    let owner = account.ok_or("Missing native push account")?;
    save_registration(saved, store, |next| {
        if matches!(action, PushAction::Stage) {
            next.stage(owner, candidate)?;
        } else {
            next.commit(owner, candidate)?;
        }
        Ok(())
    })
}

fn clear_registration(service: &PushService, account: Option<String>) -> Result<(), String> {
    let _persistence = service.persistence.recover_lock();
    save_registration(&service.saved, &service.path, |next| {
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
        Ok(())
    })?;
    let enabled = service
        .session
        .recover_lock()
        .owns(&service.saved.recover_lock());
    set_active(enabled);
    if !enabled {
        *service.candidate.recover_lock() = None;
    }
    stop_inactive(enabled)
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
            UNSUPPORTED => return Ok(("unsupported", None)),
            DEFAULT => return Ok(("default", None)),
            GRANTED if !token => return Ok(("granted", None)),
            DENIED => return Ok(("denied", None)),
            REGISTRATION => return Ok(("granted", Some(payload))),
            FAILED => return Err("Native push request failed".into()),
            _ => {}
        }
    }
}

fn native_request(_service: &PushService, prompt: bool, token: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let object_id = option_env!("ORBIT_DESKTOP_WNS_OBJECT_ID").unwrap_or("");
        if object_id.is_empty() {
            receive_value(UNSUPPORTED, String::new());
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
    if length > isize::MAX as usize || (bytes.is_null() && length != 0) {
        eprintln!("Desktop push: dropped invalid native buffer");
        receive_value(FAILED, String::new());
        return;
    }
    let bytes = if length == 0 {
        &[][..]
    } else {
        unsafe { std::slice::from_raw_parts(bytes, length) }
    };
    receive_payload(kind, bytes, receive_value);
}

fn receive_payload(kind: i32, bytes: &[u8], dispatch: impl FnOnce(i32, String)) {
    match std::str::from_utf8(bytes) {
        Ok(payload) => dispatch(kind, payload.to_owned()),
        Err(_) => {
            eprintln!("Desktop push: dropped invalid UTF-8 payload");
            dispatch(FAILED, String::new());
        }
    }
}

fn receive_value(kind: i32, payload: String) {
    let Some(service) = SERVICE.get() else {
        return;
    };
    if kind == NOTICE {
        received_payload(service, &payload);
    } else if kind == OPEN || kind == DONE {
        #[cfg(target_os = "macos")]
        {
            let destination = service.session.recover_lock().response(
                &service.saved.recover_lock(),
                &payload,
                kind == DONE,
            );
            if let Some(response) = destination {
                dispatch_response(service, response);
            }
        }
        #[cfg(windows)]
        {
            let destination = service.session.recover_lock().windows_response(
                &service.saved.recover_lock(),
                &payload,
                kind == DONE,
            );
            if let Some(response) = destination {
                dispatch_response(service, response);
            }
        }
    } else if let Some(waiter) = service.response.recover_lock().as_ref() {
        if matches!(kind, UNSUPPORTED | DEFAULT | DENIED | REGISTRATION | FAILED)
            || (kind == GRANTED && !waiter.token)
        {
            if let Err(error) = waiter.sender.try_send((kind, payload)) {
                eprintln!(
                    "Desktop push: dropped native response: {}",
                    match error {
                        mpsc::TrySendError::Full(_) => "queue full",
                        mpsc::TrySendError::Disconnected(_) => "waiter closed",
                    }
                );
            }
        }
    }
}

fn received_payload(service: &'static PushService, _payload: &str) {
    if !owns_session(service) {
        return;
    }
    #[cfg(windows)]
    {
        let Ok(payload) = serde_json::from_str::<crate::push_state::RawNotice>(_payload) else {
            eprintln!("Desktop push: dropped malformed Windows notice");
            refresh(service, false);
            return;
        };
        let Some(owner) = service.saved.recover_lock().owner.clone() else {
            return;
        };
        let language = service
            .saved
            .recover_lock()
            .language
            .clone()
            .unwrap_or_else(|| "en".into());
        let labels = crate::localization::Labels::new(&language);
        if let Err(error) = crate::push_windows::show(&payload, owner, &labels) {
            eprintln!("Cannot show desktop reminder: {error}");
        }
    }
    refresh(service, false);
}

#[derive(Default)]
struct Refresh {
    generation: u64,
    scheduled: bool,
    completed: bool,
    push: bool,
}

fn refresh(service: &'static PushService, completed: bool) {
    {
        let mut refresh = service.refresh.recover_lock();
        refresh.generation = refresh.generation.wrapping_add(1);
        refresh.completed |= completed;
        refresh.push |= !completed;
        if refresh.scheduled {
            return;
        }
        refresh.scheduled = true;
    }
    std::thread::spawn(move || loop {
        let generation = service.refresh.recover_lock().generation;
        std::thread::sleep(Duration::from_millis(250));
        let mut refresh = service.refresh.recover_lock();
        if generation != refresh.generation {
            continue;
        }
        let completed = refresh.completed;
        let push = refresh.push;
        refresh.push = false;
        refresh.completed = false;
        refresh.scheduled = false;
        drop(refresh);
        if push {
            publish_refresh(service, false);
        }
        if completed {
            publish_refresh(service, true);
        }
        break;
    });
}

fn publish_refresh(service: &PushService, completed: bool) {
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
    validate_language(language)?;
    let service = SERVICE.get().ok_or("Push service unavailable")?;
    let _persistence = service.persistence.recover_lock();
    if service.saved.recover_lock().language.as_deref() == Some(language) {
        return Ok(());
    }
    save_registration(&service.saved, &service.path, |next| {
        next.language = Some(language.into());
        Ok(())
    })?;
    #[cfg(target_os = "macos")]
    register_category(language)?;
    Ok(())
}

fn validate_language(language: &str) -> Result<(), String> {
    if matches!(language, "en" | "pt-BR") {
        Ok(())
    } else {
        Err("Unsupported desktop push language".into())
    }
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
    let Some(owner) = service.saved.recover_lock().owner.clone() else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        if !owns_session(service) || service.saved.recover_lock().owner.as_deref() != Some(&owner) {
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
                    .map(|response| done_status(response.status())),
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
        if owns_session(service) && service.saved.recover_lock().owner.as_deref() == Some(&owner) {
            if let Some(url) = destination {
                open(&service.app, url.as_deref());
            } else {
                refresh(service, true);
            }
        }
    });
}

fn done_status(status: reqwest::StatusCode) -> bool {
    if !status.is_success() {
        eprintln!("Desktop push: reminder done rejected: {status}");
    }
    status.is_success()
}

fn owns_session(service: &PushService) -> bool {
    service
        .session
        .recover_lock()
        .owns(&service.saved.recover_lock())
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

    fn registered_state() -> PushState {
        let directory = tempfile::tempdir().unwrap();
        let mut saved = PushState::load(&directory.path().join("push.json")).unwrap();
        let registration = saved
            .registration("abcd".into(), "org.useorbit.desktop", false)
            .unwrap();
        saved
            .stage("account-a".into(), registration.clone())
            .unwrap();
        saved.commit("account-a".into(), registration).unwrap();
        saved
    }

    struct Store<'a> {
        events: &'a std::cell::RefCell<Vec<&'static str>>,
        session: &'a Mutex<PushSession>,
        fail: bool,
    }
    impl PushStore for Store<'_> {
        fn save(&self, _: &PushState) -> Result<(), String> {
            assert!(
                self.session.try_lock().is_ok(),
                "disk flush held the page-load lock"
            );
            self.events.borrow_mut().push("save");
            if self.fail {
                Err("save failed".into())
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn staged_attempt_is_durable_before_the_api_caller_can_continue() {
        struct RecordingStore(std::cell::RefCell<Vec<PushState>>);
        impl PushStore for RecordingStore {
            fn save(&self, state: &PushState) -> Result<(), String> {
                self.0.borrow_mut().push(state.clone());
                Ok(())
            }
        }
        let saved = Mutex::new(registered_state());
        let mut session = PushSession::default();
        session.restore(Some("account-a".into()), &saved.recover_lock());
        let candidate = saved
            .recover_lock()
            .registration("cdef".into(), "org.useorbit.desktop", false)
            .unwrap();
        let store = RecordingStore(std::cell::RefCell::new(Vec::new()));
        persist_candidate(
            &saved,
            &store,
            &session,
            candidate.clone(),
            &PushAction::Stage,
            Some("account-a".into()),
            Some(candidate.endpoint.clone()),
        )
        .unwrap();
        assert_eq!(store.0.borrow().len(), 1);
        assert_eq!(store.0.borrow()[0].pending[0].registration, candidate);
        assert_eq!(saved.recover_lock().pending[0].registration, candidate);
        let events = std::cell::RefCell::new(Vec::new());
        let session = Mutex::new(session);
        let failing = Store {
            events: &events,
            session: &session,
            fail: true,
        };
        let session_snapshot = session.recover_lock().clone();
        assert_eq!(
            persist_candidate(
                &saved,
                &failing,
                &session_snapshot,
                candidate.clone(),
                &PushAction::Commit,
                Some("account-a".into()),
                Some(candidate.endpoint.clone()),
            ),
            Err("save failed".into())
        );
        assert_eq!(saved.recover_lock().pending[0].registration, candidate);
        assert_eq!(
            saved.recover_lock().registration.as_ref().unwrap().endpoint,
            "abcd"
        );
    }

    #[test]
    fn suspend_saves_before_native_stop_and_failed_saves_preserve_live_state() {
        for fail in [true, false] {
            let saved = Mutex::new(registered_state());
            let session = Mutex::new(PushSession::default());
            session
                .recover_lock()
                .restore(Some("account-a".into()), &saved.recover_lock());
            let events = std::cell::RefCell::new(Vec::new());
            let store = Store {
                events: &events,
                session: &session,
                fail,
            };
            let before = serde_json::to_value(&*saved.recover_lock()).unwrap();
            let result = suspend_with_store(&saved, &session, "account-a", &store, |enabled| {
                assert!(!enabled);
                events.borrow_mut().push("stop");
                Ok(())
            });
            if fail {
                assert_eq!(result, Err("save failed".into()));
                assert_eq!(*events.borrow(), ["save"]);
                assert_eq!(
                    serde_json::to_value(&*saved.recover_lock()).unwrap(),
                    before
                );
                assert_eq!(session.recover_lock().account.as_deref(), Some("account-a"));
            } else {
                assert!(result.is_ok());
                assert_eq!(*events.borrow(), ["save", "stop"]);
                assert!(saved.recover_lock().pending[0].revoke);
            }
        }
    }

    #[test]
    fn status_is_cached_while_a_request_waits_and_duplicate_requests_are_refused() {
        let operation = Mutex::new(());
        let _waiting = request_operation(&operation).unwrap();
        assert_eq!(
            request_operation(&operation).unwrap_err(),
            "Native push request already in progress"
        );
        let saved = Mutex::new(registered_state());
        let snapshot = cached_snapshot(&saved, &Mutex::new("granted"), &Mutex::new(None));
        assert_eq!(snapshot.permission, "granted");
        assert_eq!(snapshot.owner.as_deref(), Some("account-a"));
    }

    #[test]
    fn invalid_utf8_fails_the_waiter_immediately() {
        let (sender, receiver) = mpsc::sync_channel(1);
        receive_payload(REGISTRATION, &[255], |kind, payload| {
            sender.send((kind, payload)).unwrap()
        });
        assert_eq!(
            wait_for_registration(&receiver, true),
            Err("Native push request failed".into())
        );
        receive(REGISTRATION, std::ptr::null(), 1);
    }

    #[test]
    fn language_accepts_only_the_two_supported_catalogs() {
        for language in ["en", "pt-BR"] {
            assert!(validate_language(language).is_ok());
        }
        for language in ["fr", "pt", "en-US", ""] {
            assert!(validate_language(language).is_err());
        }
    }

    #[test]
    fn gone_done_response_still_opens_the_habit() {
        let reminder = crate::push_action::Reminder {
            url: Some("/habits/example".into()),
            done_token: Some("private".into()),
            ..Default::default()
        };
        let destination = tauri::async_runtime::block_on(crate::push_action::resolve(
            reminder.response(true),
            |_| async { done_status(reqwest::StatusCode::GONE) },
        ));
        assert_eq!(destination, Some(Some("/habits/example".into())));
    }

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
