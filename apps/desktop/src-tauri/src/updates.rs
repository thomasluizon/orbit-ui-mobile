use crate::locks::RecoverLock;
use crate::{
    lifecycle,
    localization::Labels,
    menus, update_manifest,
    update_state::{Phase, QuitAction, Snapshot, UpdateState},
};
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::{Update, UpdaterExt};
use uuid::Uuid;

enum Package {
    Remote(Update),
    Verified {
        update: Update,
        artifact: StagedPackage,
    },
}

struct StagedPackage {
    path: tempfile::TempPath,
    digest: [u8; 32],
}

impl StagedPackage {
    fn save(directory: &Path, bytes: &[u8]) -> Result<Self, String> {
        std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        let mut file =
            tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
        file.write_all(bytes).map_err(|error| error.to_string())?;
        file.as_file()
            .sync_all()
            .map_err(|error| error.to_string())?;
        Ok(Self {
            path: file.into_temp_path(),
            digest: Sha256::digest(bytes).into(),
        })
    }

    fn read(&self) -> Result<Vec<u8>, String> {
        let bytes = std::fs::read(&self.path).map_err(|error| error.to_string())?;
        if <[u8; 32]>::from(Sha256::digest(&bytes)) != self.digest {
            return Err("Desktop update package digest mismatch".into());
        }
        Ok(bytes)
    }
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
                let delay = handle
                    .state::<PendingUpdate>()
                    .recover_lock()
                    .check_delay(Instant::now());
                std::thread::sleep(delay.max(Duration::from_secs(1)));
            })?;
    }
    Ok(())
}

pub fn check(app: &AppHandle) {
    let Some(state) = app.try_state::<PendingUpdate>() else {
        return;
    };
    if !state.recover_lock().begin_scheduled_check(Instant::now()) {
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
    let mut state = state.recover_lock();
    state.checked(candidate);
    if state.phase() == Phase::Available {
        match state.begin_download(Uuid::new_v4()) {
            Ok(package) => Some(package),
            Err(error) => {
                eprintln!("Cannot begin desktop update download: {error}");
                None
            }
        }
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
    Ok(Some((update.version.clone(), Package::Remote(update))))
}

pub fn offer_or_check(app: &AppHandle) {
    let available = {
        let state = app.state::<PendingUpdate>();
        let mut state = state.recover_lock();
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
        .recover_lock()
        .request_restart();
    if let Err(error) = lifecycle::show_main(app) {
        eprintln!("Cannot show desktop update: {error}");
    }
}

pub fn request_quit(app: &AppHandle) -> bool {
    let Some(state) = app.try_state::<PendingUpdate>() else {
        return false;
    };
    dispatch_quit(&state, |package| {
        show_status(app);
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(error) = install_package(&app, package, false) {
                eprintln!("Cannot complete desktop update: {error}");
            }
        });
    })
}

fn dispatch_quit<T>(state: &Mutex<UpdateState<T>>, install: impl FnOnce(T)) -> bool {
    let action = state.recover_lock().request_quit();
    match action {
        QuitAction::Exit => false,
        QuitAction::Wait => true,
        QuitAction::Install(package) => {
            install(package);
            true
        }
    }
}

pub fn show_prompt(app: &AppHandle) {
    let Some(state) = app.try_state::<PendingUpdate>() else {
        return;
    };
    if !state.recover_lock().snapshot().prompt_pending {
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
        .recover_lock()
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
                .recover_lock()
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
    if !crate::command_origin::allows(window.label(), &url, origin) {
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
        _ => apply_action(&app.state::<PendingUpdate>(), action, commit, reservation)?,
    }
    show_status(&app);
    let snapshot = app.state::<PendingUpdate>().recover_lock().snapshot();
    Ok(snapshot)
}

fn apply_action(
    state: &PendingUpdate,
    action: Action,
    commit: Option<String>,
    reservation: Option<Uuid>,
) -> Result<(), String> {
    let mut state = state.recover_lock();
    match action {
        Action::WebRelease => {
            validate_web_commit(commit.as_deref())?;
            state.web_commit = commit;
        }
        Action::Defer => state.defer(),
        Action::Cancel => state.clear_restart(),
        Action::Release => {
            state.release_install(reservation.ok_or("Missing desktop update reservation")?)
        }
        _ => {}
    }
    Ok(())
}

fn validate_web_commit(commit: Option<&str>) -> Result<(), String> {
    if commit.is_some_and(|commit| {
        commit.len() != 40
            || !commit
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    }) {
        return Err("Invalid desktop web commit".into());
    }
    Ok(())
}

async fn download(app: &AppHandle, reservation: Uuid) -> Result<(), String> {
    let package = {
        let state = app.state::<PendingUpdate>();
        let mut state = state.recover_lock();
        state.begin_download(reservation)?
    };
    download_package(app, package).await;
    Ok(())
}

async fn download_package(app: &AppHandle, package: Package) {
    show_status(app);
    let update = match package {
        Package::Verified { update, artifact } => {
            if artifact.read().is_ok() {
                app.state::<PendingUpdate>()
                    .recover_lock()
                    .downloaded(Package::Verified { update, artifact }, true);
                return;
            }
            update
        }
        Package::Remote(update) => update,
    };
    let staged = stage_download(app, &update).await;
    let (package, verified) = match staged {
        Ok(artifact) => (Package::Verified { update, artifact }, true),
        Err(error) => {
            eprintln!("Cannot download desktop update: {error}");
            (Package::Remote(update), false)
        }
    };
    app.state::<PendingUpdate>()
        .recover_lock()
        .downloaded(package, verified);
}

async fn stage_download(app: &AppHandle, update: &Update) -> Result<StagedPackage, String> {
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("updates");
    tauri::async_runtime::spawn_blocking(move || StagedPackage::save(&directory, &bytes))
        .await
        .map_err(|error| error.to_string())?
}

async fn install(app: &AppHandle, url: &tauri::Url) -> Result<(), String> {
    let package = reserve_install(&app.state::<PendingUpdate>(), || {
        crate::update_resume::save(app, url)
    })?;
    show_status(app);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_package(&app, package, true))
        .await
        .map_err(|error| error.to_string())?
}

fn reserve_install<T>(
    state: &Mutex<UpdateState<T>>,
    save: impl FnOnce() -> Result<(), String>,
) -> Result<T, String> {
    let package = state.recover_lock().begin_install()?;
    if let Err(error) = save() {
        state.recover_lock().install_failed(package);
        return Err(error);
    }
    Ok(package)
}

fn install_package(app: &AppHandle, package: Package, resume_saved: bool) -> Result<(), String> {
    lifecycle::save_window(app);
    run_install(
        &app.state::<PendingUpdate>(),
        package,
        |package, quitting| match package {
            Package::Verified { update, artifact } => update
                .clone()
                .restart_after_install(!quitting)
                .install(artifact.read()?)
                .map_err(|error| error.to_string()),
            Package::Remote(_) => Err("Desktop update is not downloaded".into()),
        },
        |quitting, result| finish_install(app, resume_saved, quitting, result),
    )
}

fn finish_install(
    app: &AppHandle,
    resume_saved: bool,
    quitting: bool,
    result: Result<(), String>,
) -> Result<(), String> {
    let mut cleanup = Ok(());
    if let Err(error) = &result {
        eprintln!("Cannot install desktop update: {error}");
        if resume_saved {
            cleanup = crate::update_resume::clear(app);
        }
    }
    show_status(app);
    if quitting {
        app.exit(0);
    } else if result.is_err() {
        if let Err(error) = lifecycle::show_main(app) {
            eprintln!("Cannot show failed desktop update: {error}");
        }
    } else {
        #[cfg(not(windows))]
        app.request_restart();
    }
    result.and(cleanup)
}

fn run_install<T, E, R>(
    state: &Mutex<UpdateState<T>>,
    package: T,
    install: impl FnOnce(&T, bool) -> Result<(), E>,
    finish: impl FnOnce(bool, Result<(), E>) -> R,
) -> R {
    let quitting = state.recover_lock().quit_requested;
    let result = install(&package, quitting);
    let quitting = {
        let mut state = state.recover_lock();
        let quitting = state.quit_requested;
        if result.is_ok() {
            state.installed();
        } else {
            state.install_failed(package);
        }
        quitting
    };
    finish(quitting, result)
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
        let state = state.recover_lock();
        let snapshot = state.snapshot();
        if state.published.as_ref() == Some(&(snapshot.clone(), state.enabled)) {
            return Ok(());
        }
        (snapshot, state.enabled)
    };
    publish(&snapshot, enabled)?;
    state.recover_lock().published = Some((snapshot, enabled));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_refusals_never_save_a_resume_record() {
        let state = Mutex::new(UpdateState::<()>::new(true));
        assert_eq!(
            reserve_install(&state, || panic!("unexpected resume save")),
            Err("Desktop update is not downloaded".into())
        );
        let package = checked_package(&state, Ok(Some(("0.2.0".into(), ())))).unwrap();
        state.recover_lock().downloaded(package, true);
        assert_eq!(
            reserve_install(&state, || panic!("unexpected resume save")),
            Err("Desktop update awaits native confirmation".into())
        );
        let version = state.recover_lock().take_prompt(true).unwrap();
        state.recover_lock().answer_prompt(&version, false);
        assert_eq!(
            reserve_install(&state, || panic!("unexpected resume save")),
            Err("Desktop update restart was not requested".into())
        );
    }

    #[test]
    fn staged_packages_recheck_the_digest_and_preserve_failed_installs_for_retry() {
        let directory = tempfile::tempdir().unwrap();
        let package = StagedPackage::save(directory.path(), b"verified installer").unwrap();
        assert_eq!(package.read().unwrap(), b"verified installer");
        std::fs::write(&package.path, b"tampered installer").unwrap();
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), package))));
        let package = state.begin_download(Uuid::new_v4()).unwrap();
        state.downloaded(package, true);
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, true);
        let state = Mutex::new(state);
        let package = reserve_install(&state, || Ok(())).unwrap();
        run_install(
            &state,
            package,
            |package, _| package.read().map(|_| ()),
            |_, result| {
                assert_eq!(result, Err("Desktop update package digest mismatch".into()));
            },
        );
        assert_eq!(state.recover_lock().phase(), Phase::Failed);
        assert!(state.recover_lock().package().is_some());
    }

    #[test]
    fn unchanged_snapshots_do_not_update_the_menu() {
        let state = Mutex::new(UpdateState::<()>::new(true));
        publish_status(&state, |_, _| Ok::<(), ()>(())).unwrap();
        publish_status(&state, |_, _| -> Result<(), ()> {
            panic!("unchanged menu")
        })
        .unwrap();
    }

    #[test]
    fn background_check_downloads_before_prompting_and_pins_the_ready_version() {
        let state = Mutex::new(UpdateState::new(true));
        let package = checked_package(&state, Ok(Some(("0.2.0".into(), "package")))).unwrap();
        {
            let mut state = state.recover_lock();
            assert_eq!(state.phase(), Phase::Downloading);
            assert_eq!(state.take_prompt(true), None);
            state.downloaded(package, true);
            assert_eq!(state.take_prompt(false), None);
        }
        assert_eq!(
            checked_package(&state, Ok(Some(("0.3.0".into(), "newer")))),
            None
        );
        let mut state = state.recover_lock();
        assert_eq!(state.take_prompt(true).as_deref(), Some("0.2.0"));
        assert_eq!(state.take_prompt(true), None);
        assert_eq!(state.package().copied(), Some("package"));
    }

    #[test]
    fn failed_background_download_requires_retry_and_does_not_prompt() {
        let state = Mutex::new(UpdateState::new(true));
        let package = checked_package(&state, Ok(Some(("0.2.0".into(), "package")))).unwrap();
        state.recover_lock().downloaded(package, false);
        assert_eq!(
            checked_package(&state, Ok(Some(("0.2.0".into(), "same")))),
            None
        );
        assert_eq!(state.recover_lock().take_prompt(true), None);
        assert_eq!(state.recover_lock().phase(), Phase::Failed);
    }

    fn deferred_package() -> Mutex<UpdateState<&'static str>> {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(Uuid::new_v4()).unwrap();
        state.downloaded(package, true);
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, false);
        Mutex::new(state)
    }

    #[test]
    fn quit_installs_without_web_and_repeated_quit_waits_until_completion() {
        let state = deferred_package();
        let exited = std::cell::Cell::new(false);
        assert!(dispatch_quit(&state, |package| {
            assert_eq!(state.recover_lock().phase(), Phase::Installing);
            assert!(!state.recover_lock().snapshot().restart_requested);
            run_install(
                &state,
                package,
                |package, quitting| {
                    assert_eq!(*package, "package");
                    assert!(quitting);
                    for _ in 0..2 {
                        assert!(dispatch_quit(&state, |_| panic!("duplicate installation")));
                        assert!(!exited.get());
                        assert_eq!(state.recover_lock().phase(), Phase::Installing);
                    }
                    Ok::<(), &str>(())
                },
                |quitting, result| {
                    assert!(quitting);
                    assert!(result.is_ok());
                    assert_eq!(state.try_lock().unwrap().phase(), Phase::Idle);
                    assert!(!dispatch_quit(&state, |_| panic!("completed installation")));
                    exited.set(true);
                },
            );
        }));
        assert!(exited.get());
    }

    #[test]
    fn failed_quit_install_exits_and_keeps_the_package_for_explicit_retry() {
        let state = deferred_package();
        let exited = std::cell::Cell::new(false);
        assert!(dispatch_quit(&state, |package| {
            run_install(
                &state,
                package,
                |_, quitting| {
                    assert!(quitting);
                    assert!(dispatch_quit(&state, |_| panic!("duplicate installation")));
                    assert!(!exited.get());
                    Err("install failed")
                },
                |quitting, result: Result<(), &str>| {
                    assert!(quitting);
                    assert_eq!(result, Err("install failed"));
                    let snapshot = state.try_lock().unwrap().snapshot();
                    assert_eq!(snapshot.phase, Phase::Failed);
                    assert_eq!(snapshot.shell_version.as_deref(), Some("0.2.0"));
                    assert_eq!(state.recover_lock().package().copied(), Some("package"));
                    assert!(!dispatch_quit(&state, |_| panic!("implicit retry")));
                    exited.set(true);
                },
            );
        }));
        assert!(exited.get());
    }

    #[test]
    fn quit_without_a_deferred_package_exits_without_installing() {
        let state = Mutex::new(UpdateState::<()>::new(true));
        assert!(!dispatch_quit(&state, |_| panic!("no package to install")));
    }

    #[test]
    fn restart_now_keeps_the_web_handoff_and_relaunches_after_installing() {
        let state = deferred_package();
        state.recover_lock().request_restart();
        {
            let state = state.recover_lock();
            assert!(state.snapshot().restart_requested);
            assert_eq!(state.phase(), Phase::Downloaded);
            assert_eq!(state.package().copied(), Some("package"));
            assert!(!state.quit_requested);
        }
        let package = state.recover_lock().begin_install().unwrap();
        run_install(
            &state,
            package,
            |_, quitting| {
                assert!(!quitting);
                Ok::<(), &str>(())
            },
            |quitting, result| {
                assert!(!quitting);
                assert!(result.is_ok());
                assert_eq!(state.recover_lock().phase(), Phase::Idle);
            },
        );
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
        assert!(state.recover_lock().snapshot().restart_requested);
    }
}
