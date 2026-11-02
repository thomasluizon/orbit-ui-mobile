#[cfg(windows)]
use crate::locks::RecoverLock;
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::{ffi::CString, os::windows::ffi::OsStrExt, sync::Mutex};
use std::{
    io::{Read, Write},
    path::Path,
    time::{Duration, Instant},
};
#[cfg(windows)]
use tauri::{AppHandle, Manager};

#[cfg(windows)]
static RUNTIME: Mutex<RuntimeCache> = Mutex::new(RuntimeCache::new());

struct RuntimeCache {
    ready: bool,
    failure: Option<(Instant, String)>,
}

impl RuntimeCache {
    const fn new() -> Self {
        Self {
            ready: false,
            failure: None,
        }
    }
    fn initialize(
        &mut self,
        now: Instant,
        initialize: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        if self.ready {
            return Ok(());
        }
        if let Some((failed, error)) = &self.failure {
            if now.saturating_duration_since(*failed) < Duration::from_secs(600) {
                return Err(error.clone());
            }
        }
        match initialize() {
            Ok(()) => {
                self.ready = true;
                self.failure = None;
                Ok(())
            }
            Err(error) => {
                self.failure = Some((now, error.clone()));
                Err(error)
            }
        }
    }
}

fn verify_embedded(path: &Path, embedded: &[u8]) -> Result<(), String> {
    let mut file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    if file.metadata().map_err(|error| error.to_string())?.len() != embedded.len() as u64 {
        return Err("Windows runtime file integrity check failed".into());
    }
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let length = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if length == 0 {
            break;
        }
        digest.update(&buffer[..length]);
    }
    if digest.finalize() != Sha256::digest(embedded) {
        return Err("Windows runtime file integrity check failed".into());
    }
    Ok(())
}

fn prepare_embedded(path: &Path, embedded: &[u8]) -> Result<(), String> {
    if path.exists() {
        return verify_embedded(path, embedded);
    }
    let directory = path.parent().ok_or("Missing Windows runtime directory")?;
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
    file.write_all(embedded)
        .map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    verify_embedded(path, embedded)
}

#[cfg(windows)]
pub fn show(
    notice: &crate::push_state::RawNotice,
    owner: String,
    labels: &crate::localization::Labels,
) -> Result<(), String> {
    let title = CString::new(notice.title.as_str()).map_err(|error| error.to_string())?;
    let body =
        CString::new(notice.body.as_deref().unwrap_or("")).map_err(|error| error.to_string())?;
    let notice = crate::push_action::WindowsNotice {
        owner,
        reminder: notice.reminder.clone(),
    };
    let activation =
        CString::new(serde_json::to_string(&notice).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    let done = notice
        .reminder
        .done_token
        .as_ref()
        .is_some_and(|token| !token.is_empty());
    let label = CString::new(
        notice
            .reminder
            .done_label
            .as_deref()
            .unwrap_or(labels.text("reminderDone")),
    )
    .map_err(|error| error.to_string())?;
    if unsafe {
        orbit_push_show(
            title.as_ptr(),
            body.as_ptr(),
            activation.as_ptr(),
            done,
            label.as_ptr(),
        )
    } {
        Ok(())
    } else {
        Err("Cannot show Windows reminder".into())
    }
}

#[cfg(windows)]
pub fn activate() -> Result<(), String> {
    if unsafe { orbit_push_activate() } {
        Ok(())
    } else {
        Err("Cannot read Windows notification activation".into())
    }
}

#[cfg(windows)]
pub fn initialize(
    app: &AppHandle,
    callback: extern "C" fn(i32, *const u8, usize),
) -> Result<(), String> {
    RUNTIME
        .recover_lock()
        .initialize(Instant::now(), || initialize_runtime(app, callback))
}

#[cfg(windows)]
fn initialize_runtime(
    app: &AppHandle,
    callback: extern "C" fn(i32, *const u8, usize),
) -> Result<(), String> {
    let embedded = include_bytes!(env!("ORBIT_WNS_BOOTSTRAP"));
    let embedded_installer = include_bytes!(env!("ORBIT_WNS_INSTALLER"));
    let mut fingerprint = Sha256::new();
    fingerprint.update(embedded);
    fingerprint.update(embedded_installer);
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join(format!("windows-app-sdk-{:x}", fingerprint.finalize()));
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let bootstrap = directory.join("Microsoft.WindowsAppRuntime.Bootstrap.dll");
    let installer = directory.join("WindowsAppRuntimeInstall.exe");
    prepare_embedded(&bootstrap, embedded)?;
    let object_id = CString::new(option_env!("ORBIT_DESKTOP_WNS_OBJECT_ID").unwrap_or(""))
        .map_err(|error| error.to_string())?;
    let path = bootstrap
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let initialize = || {
        verify_embedded(&bootstrap, embedded)?;
        Ok::<i32, String>(unsafe {
            orbit_wns_initialize(path.as_ptr(), object_id.as_ptr(), callback)
        })
    };
    let mut result = initialize()?;
    if result == 1 {
        prepare_embedded(&installer, embedded_installer)?;
        verify_embedded(&installer, embedded_installer)?;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        use std::os::windows::process::CommandExt;
        let installed = std::process::Command::new(&installer)
            .arg("--quiet")
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|error| error.to_string())?;
        if !installed.success() {
            return Err("Cannot install Windows App SDK runtime".into());
        }
        result = initialize()?;
    }
    if result != 0 {
        return Err("Cannot initialize Windows push notifications".into());
    }
    Ok(())
}

#[cfg(windows)]
unsafe extern "C" {
    fn orbit_push_activate() -> bool;
    fn orbit_push_show(
        title: *const std::ffi::c_char,
        body: *const std::ffi::c_char,
        activation: *const std::ffi::c_char,
        done: bool,
        label: *const std::ffi::c_char,
    ) -> bool;
    fn orbit_wns_initialize(
        bootstrap: *const u16,
        object_id: *const std::ffi::c_char,
        callback: extern "C" fn(i32, *const u8, usize),
    ) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changed_cached_runtime_files_are_refused_before_use() {
        let directory = tempfile::tempdir().unwrap();
        for name in ["bootstrap.dll", "installer.exe"] {
            let path = directory.path().join(name);
            prepare_embedded(&path, b"trusted runtime").unwrap();
            std::fs::write(&path, b"changed runtime").unwrap();
            assert_eq!(
                prepare_embedded(&path, b"trusted runtime"),
                Err("Windows runtime file integrity check failed".into())
            );
        }
    }

    #[test]
    fn failed_runtime_initialization_is_cached_for_ten_minutes() {
        let mut cache = RuntimeCache::new();
        let now = Instant::now();
        assert_eq!(
            cache.initialize(now, || Err("install failed".into())),
            Err("install failed".into())
        );
        assert_eq!(
            cache.initialize(now + Duration::from_secs(599), || panic!(
                "cached failure retried"
            )),
            Err("install failed".into())
        );
        assert!(cache
            .initialize(now + Duration::from_secs(600), || Ok(()))
            .is_ok());
        assert!(cache
            .initialize(now + Duration::from_secs(601), || panic!(
                "initialized twice"
            ))
            .is_ok());
    }
}
