use crate::{
    lifecycle,
    localization::Labels,
    menus, update_manifest,
    update_state::{Phase, Snapshot, UpdateState},
};
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::{Update, UpdaterExt};
use uuid::Uuid;

const CHECK_INTERVAL: Duration = Duration::from_secs(60);
struct Package {
    update: Update,
    bytes: Option<Vec<u8>>,
}
type PendingUpdate = Mutex<UpdateState<Package>>;

pub fn start(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let config: tauri_plugin_updater::Config =
        serde_json::from_value(app.config().plugins.0["updater"].clone())?;
    update_manifest::validate_config(update_manifest::channel(&app.config().identifier)?, &config)?;
    let enabled = !config.pubkey.is_empty();
    app.manage(PendingUpdate::new(UpdateState::new(enabled)));
    show_status(app);
    if enabled {
        let handle = app.clone();
        std::thread::Builder::new()
            .name("desktop-updates".into())
            .spawn(move || loop {
                check(&handle);
                std::thread::sleep(CHECK_INTERVAL);
            })?;
    }
    Ok(())
}

pub fn check(app: &AppHandle) {
    let Some(state) = app.try_state::<PendingUpdate>() else {
        return;
    };
    if !state.lock().unwrap().begin_check() {
        return;
    }
    show_status(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = check_release(&app).await.map_err(|error| {
            eprintln!("Cannot check desktop update: {error}");
        });
        let package = checked_package(&app.state::<PendingUpdate>(), result);
        if let Some(package) = package {
            download_package(&app, package).await;
        }
        show_status(&app);
    });
}

fn checked_package<T>(
    state: &Mutex<UpdateState<T>>,
    candidate: Result<Option<(String, T)>, ()>,
) -> Option<T> {
    let mut state = state.lock().unwrap();
    state.checked(candidate);
    if state.phase == Phase::Available {
        Some(state.begin_download(Uuid::new_v4()).unwrap())
    } else {
        None
    }
}

async fn check_release(
    app: &AppHandle,
) -> Result<Option<(String, Package)>, Box<dyn std::error::Error + Send + Sync>> {
    let Some(mut update) = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()?
        .check()
        .await?
    else {
        return Ok(None);
    };
    update_manifest::validate_manifest(
        update_manifest::channel(&app.config().identifier)?,
        update.raw_json.clone(),
    )?;
    update.timeout = Some(Duration::from_secs(5 * 60));
    Ok(Some((
        update.version.clone(),
        Package {
            update,
            bytes: None,
        },
    )))
}

pub fn offer_or_check(app: &AppHandle) {
    let available = {
        let state = app.state::<PendingUpdate>();
        let mut state = state.lock().unwrap();
        let available = state.version.is_some() || state.web_commit.is_some();
        if available {
            state.reveal();
        }
        available
    };
    if available {
        if let Err(error) = lifecycle::show_main(app) {
            eprintln!("Cannot show desktop update: {error}");
        }
    } else {
        check(app);
    }
}

pub fn request_restart(app: &AppHandle) {
    app.state::<PendingUpdate>()
        .lock()
        .unwrap()
        .request_restart();
    if let Err(error) = lifecycle::show_main(app) {
        eprintln!("Cannot show desktop update: {error}");
    }
}

pub fn request_quit(app: &AppHandle) -> bool {
    let Some(state) = app.try_state::<PendingUpdate>() else {
        return false;
    };
    let waiting = state.lock().unwrap().request_quit();
    if waiting {
        show_status(app);
    }
    waiting
}

pub fn show_prompt(app: &AppHandle) {
    let Some(state) = app.try_state::<PendingUpdate>() else {
        return;
    };
    if !state.lock().unwrap().snapshot().prompt_pending {
        return;
    }
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = prompt_visible_window(&handle) {
            eprintln!("Cannot show desktop update dialog: {error}");
        }
    }) {
        eprintln!("Cannot schedule desktop update dialog: {error}");
    }
}

fn prompt_visible_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let visible = window.is_visible()?;
    let version = app
        .state::<PendingUpdate>()
        .lock()
        .unwrap()
        .take_prompt(visible);
    let Some(version) = version else {
        return Ok(());
    };
    let labels = Labels::new(&sys_locale::get_locale().unwrap_or_default());
    let handle = app.clone();
    app.dialog()
        .message(labels.text("updatePromptBody"))
        .title(labels.text("updatePromptTitle"))
        .parent(&window)
        .buttons(MessageDialogButtons::OkCancelCustom(
            labels.text("updateRestartNow").into(),
            labels.text("updateLater").into(),
        ))
        .show(move |restart| {
            handle
                .state::<PendingUpdate>()
                .lock()
                .unwrap()
                .answer_prompt(&version, restart);
            show_status(&handle);
        });
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    Status,
    WebRelease,
    Defer,
    Download,
    Install,
    Cancel,
    Release,
}

#[tauri::command]
pub async fn desktop_update(
    window: WebviewWindow,
    action: Action,
    commit: Option<String>,
    reservation: Option<Uuid>,
) -> Result<Snapshot, String> {
    let app = window.app_handle().clone();
    let tauri::utils::config::WebviewUrl::External(origin) = &app.config().app.windows[0].url
    else {
        return Err("Desktop requires a deployed origin".into());
    };
    let url = window.url().map_err(|error| error.to_string())?;
    if window.label() != "main" || url.origin() != origin.origin() {
        return Err("Invalid desktop update origin".into());
    }
    match action {
        Action::Download => {
            download(
                &app,
                reservation.ok_or("Missing desktop update reservation")?,
            )
            .await?
        }
        Action::Install => install(&app, &url).await?,
        _ => {
            let state = app.state::<PendingUpdate>();
            let mut state = state.lock().unwrap();
            match action {
                Action::WebRelease => {
                    if let Some(commit) = &commit {
                        if commit.len() != 40
                            || !commit
                                .bytes()
                                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                        {
                            return Err("Invalid desktop web commit".into());
                        }
                    }
                    state.web_commit = commit;
                }
                Action::Defer => state.defer(),
                Action::Cancel => state.clear_restart(),
                Action::Release => {
                    state.release_install(reservation.ok_or("Missing desktop update reservation")?)
                }
                _ => {}
            }
        }
    }
    show_status(&app);
    let snapshot = app.state::<PendingUpdate>().lock().unwrap().snapshot();
    Ok(snapshot)
}

async fn download(app: &AppHandle, reservation: Uuid) -> Result<(), String> {
    let package = {
        let state = app.state::<PendingUpdate>();
        let mut state = state.lock().unwrap();
        state.begin_download(reservation)?
    };
    download_package(app, package).await;
    Ok(())
}

async fn download_package(app: &AppHandle, package: Package) {
    show_status(app);
    let result = match package.bytes {
        Some(bytes) => Ok(bytes),
        None => package.update.download(|_, _| {}, || {}).await,
    };
    let state = app.state::<PendingUpdate>();
    let mut state = state.lock().unwrap();
    let (bytes, verified) = match result {
        Ok(bytes) => (Some(bytes), true),
        Err(error) => {
            eprintln!("Cannot download desktop update: {error}");
            (None, false)
        }
    };
    state.downloaded(
        Package {
            update: package.update,
            bytes,
        },
        verified,
    );
}

async fn install(app: &AppHandle, url: &tauri::Url) -> Result<(), String> {
    let (package, quitting) = {
        let state = app.state::<PendingUpdate>();
        let mut state = state.lock().unwrap();
        if state.phase != Phase::Downloaded {
            return Err("Desktop update is not downloaded".into());
        }
        if state.snapshot().prompt_pending {
            return Err("Desktop update awaits native confirmation".into());
        }
        crate::update_resume::save(app, url).map_err(|error| error.to_string())?;
        (state.begin_install()?, state.quit_requested)
    };
    show_status(app);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        lifecycle::save_window(&app);
        let update = package.update.clone().restart_after_install(!quitting);
        if let Err(error) = update.install(package.bytes.as_ref().unwrap()) {
            eprintln!("Cannot install desktop update: {error}");
            let cleanup = crate::update_resume::clear(&app);
            let state = app.state::<PendingUpdate>();
            let mut state = state.lock().unwrap();
            state.install_failed(package);
            drop(state);
            if let Err(error) = lifecycle::show_main(&app) {
                eprintln!("Cannot show failed desktop update: {error}");
            }
            return cleanup;
        }
        app.state::<PendingUpdate>().lock().unwrap().installed();
        #[cfg(not(windows))]
        if quitting {
            app.exit(0);
        } else {
            app.request_restart();
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn show_status(app: &AppHandle) {
    let state = app.state::<PendingUpdate>();
    if let Err(error) = publish_status(&state, |snapshot, enabled| {
        menus::update_status(app, snapshot, enabled)
    }) {
        eprintln!("Cannot show desktop update status: {error}");
    }
    show_prompt(app);
}

fn publish_status<T, E>(
    state: &Mutex<UpdateState<T>>,
    publish: impl FnOnce(&Snapshot, bool) -> Result<(), E>,
) -> Result<(), E> {
    let (snapshot, enabled) = {
        let state = state.lock().unwrap();
        (state.snapshot(), state.enabled)
    };
    publish(&snapshot, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn background_check_downloads_before_prompting_and_pins_the_ready_version() {
        let state = Mutex::new(UpdateState::new(true));
        let package = checked_package(&state, Ok(Some(("0.2.0".into(), "package")))).unwrap();
        {
            let mut state = state.lock().unwrap();
            assert_eq!(state.phase, Phase::Downloading);
            assert_eq!(state.take_prompt(true), None);
            state.downloaded(package, true);
            assert_eq!(state.take_prompt(false), None);
        }
        assert_eq!(
            checked_package(&state, Ok(Some(("0.3.0".into(), "newer")))),
            None
        );
        let mut state = state.lock().unwrap();
        assert_eq!(state.take_prompt(true).as_deref(), Some("0.2.0"));
        assert_eq!(state.take_prompt(true), None);
        assert_eq!(state.package, Some("package"));
    }

    #[test]
    fn failed_background_download_requires_retry_and_does_not_prompt() {
        let state = Mutex::new(UpdateState::new(true));
        let package = checked_package(&state, Ok(Some(("0.2.0".into(), "package")))).unwrap();
        state.lock().unwrap().downloaded(package, false);
        assert_eq!(
            checked_package(&state, Ok(Some(("0.2.0".into(), "same")))),
            None
        );
        assert_eq!(state.lock().unwrap().take_prompt(true), None);
        assert_eq!(state.lock().unwrap().phase, Phase::Failed);
    }

    #[test]
    fn status_menu_sink_can_take_the_update_lock() {
        let state = Mutex::new(UpdateState::new(true));
        state
            .lock()
            .unwrap()
            .checked(Ok(Some(("0.2.0".into(), ()))));
        let result = publish_status(&state, |snapshot, enabled| {
            assert!(enabled);
            assert_eq!(snapshot.shell_version.as_deref(), Some("0.2.0"));
            let mut callback = state
                .try_lock()
                .expect("menu sink must not hold the update lock");
            callback.request_restart();
            Err("menu unavailable")
        });
        assert_eq!(result, Err("menu unavailable"));
        assert!(state.lock().unwrap().snapshot().restart_requested);
    }
}
