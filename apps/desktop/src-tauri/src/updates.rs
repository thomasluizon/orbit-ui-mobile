use crate::{
    lifecycle, menus, update_manifest,
    update_state::{Phase, Snapshot, UpdateState},
};
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};

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
        app.state::<PendingUpdate>().lock().unwrap().checked(result);
        show_status(&app);
    });
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

pub fn request_restart(app: &AppHandle) {
    app.state::<PendingUpdate>()
        .lock()
        .unwrap()
        .request_restart();
    if let Err(error) = lifecycle::show_main(app) {
        eprintln!("Cannot show desktop update: {error}");
    }
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
}

#[tauri::command]
pub async fn desktop_update(
    window: WebviewWindow,
    action: Action,
    commit: Option<String>,
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
        Action::Download => download(&app).await?,
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
                _ => {}
            }
        }
    }
    show_status(&app);
    let snapshot = app.state::<PendingUpdate>().lock().unwrap().snapshot();
    Ok(snapshot)
}

async fn download(app: &AppHandle) -> Result<(), String> {
    let package = {
        let state = app.state::<PendingUpdate>();
        let mut state = state.lock().unwrap();
        if state.busy() {
            return Err("Desktop update already in progress".into());
        }
        let package = state
            .package
            .take()
            .ok_or("No desktop shell update available")?;
        state.clear_restart();
        state.phase = Phase::Downloading;
        package
    };
    show_status(app);
    let result = match package.bytes {
        Some(bytes) => Ok(bytes),
        None => package.update.download(|_, _| {}, || {}).await,
    };
    let state = app.state::<PendingUpdate>();
    let mut state = state.lock().unwrap();
    let (bytes, phase) = match result {
        Ok(bytes) => (Some(bytes), Phase::Downloaded),
        Err(error) => {
            eprintln!("Cannot download desktop update: {error}");
            (None, Phase::Failed)
        }
    };
    state.package = Some(Package {
        update: package.update,
        bytes,
    });
    state.phase = phase;
    Ok(())
}

async fn install(app: &AppHandle, url: &tauri::Url) -> Result<(), String> {
    let package = {
        let state = app.state::<PendingUpdate>();
        let mut state = state.lock().unwrap();
        if state.phase != Phase::Downloaded {
            return Err("Desktop update is not downloaded".into());
        }
        crate::update_resume::save(app, url).map_err(|error| error.to_string())?;
        state.phase = Phase::Installing;
        state
            .package
            .take()
            .ok_or("Missing desktop update package")?
    };
    show_status(app);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        lifecycle::save_window(&app);
        if let Err(error) = package.update.install(package.bytes.as_ref().unwrap()) {
            eprintln!("Cannot install desktop update: {error}");
            let cleanup = crate::update_resume::clear(&app);
            let state = app.state::<PendingUpdate>();
            let mut state = state.lock().unwrap();
            state.package = Some(package);
            state.phase = Phase::Failed;
            return cleanup;
        }
        #[cfg(not(windows))]
        app.request_restart();
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn show_status(app: &AppHandle) {
    let state = app.state::<PendingUpdate>();
    let state = state.lock().unwrap();
    if let Err(error) = menus::update_status(app, &state.snapshot(), state.enabled) {
        eprintln!("Cannot show desktop update status: {error}");
    }
}
