use crate::{lifecycle, localization::Labels, menus, update_manifest, update_state::UpdateState};
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::{Update, UpdaterExt};

const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
struct DownloadedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

type PendingUpdate = Mutex<UpdateState<DownloadedUpdate>>;

#[derive(Clone, Copy)]
pub enum Status {
    Disabled,
    Idle,
    Checking,
    Ready,
    Installing,
    CheckFailed,
    InstallFailed,
}

pub fn start(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let config: tauri_plugin_updater::Config =
        serde_json::from_value(app.config().plugins.0["updater"].clone())?;
    update_manifest::validate_config(update_manifest::channel(&app.config().identifier)?, &config)?;
    app.manage(PendingUpdate::new(UpdateState::Idle));
    if config.pubkey.is_empty() {
        show_status(app, Status::Disabled);
        return Ok(());
    }
    let handle = app.clone();
    std::thread::Builder::new()
        .name("desktop-updates".into())
        .spawn(move || loop {
            check(&handle);
            std::thread::sleep(CHECK_INTERVAL);
        })?;
    Ok(())
}

pub fn check(app: &AppHandle) {
    if !app.state::<PendingUpdate>().lock().unwrap().begin_check() {
        return;
    }
    show_status(app, Status::Checking);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = download(&app).await;
        let (downloaded, status) = match result {
            Ok(Some(downloaded)) => (Some(downloaded), Status::Ready),
            Ok(None) => (None, Status::Idle),
            Err(error) => {
                eprintln!("Cannot download desktop update: {error}");
                (None, Status::CheckFailed)
            }
        };
        app.state::<PendingUpdate>()
            .lock()
            .unwrap()
            .checked(downloaded);
        show_status(&app, status);
        if matches!(status, Status::Ready) {
            notice(&app, "updateReady", "updateNotice");
        }
    });
}

async fn download(
    app: &AppHandle,
) -> Result<Option<DownloadedUpdate>, Box<dyn std::error::Error + Send + Sync>> {
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
    let bytes = update.download(|_, _| {}, || {}).await?;
    Ok(Some(DownloadedUpdate { update, bytes }))
}

pub fn restart(app: &AppHandle) {
    let Some(downloaded) = app
        .state::<PendingUpdate>()
        .lock()
        .unwrap()
        .request_install()
    else {
        return;
    };
    show_status(app, Status::Installing);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        lifecycle::save_window(&app);
        if let Err(error) = downloaded.update.install(&downloaded.bytes) {
            eprintln!("Cannot install desktop update: {error}");
            app.state::<PendingUpdate>()
                .lock()
                .unwrap()
                .install_failed(downloaded);
            show_status(&app, Status::InstallFailed);
            notice(&app, "updateFailed", "updateRetryNotice");
            return;
        }
        #[cfg(not(windows))]
        app.request_restart();
    });
}

fn show_status(app: &AppHandle, status: Status) {
    if let Err(error) = menus::update_status(app, status) {
        eprintln!("Cannot show desktop update status: {error}");
    }
}

fn notice(app: &AppHandle, title: &str, body: &str) {
    let labels = Labels::new(&sys_locale::get_locale().unwrap_or_default());
    if let Err(error) = app
        .notification()
        .builder()
        .title(labels.text(title))
        .body(labels.text(body))
        .show()
    {
        eprintln!("Cannot show desktop update notice: {error}");
    }
}
