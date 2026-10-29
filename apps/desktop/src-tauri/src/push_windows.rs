use std::{ffi::CString, os::windows::ffi::OsStrExt, sync::OnceLock};
use tauri::{AppHandle, Manager};

static INITIALIZED: OnceLock<()> = OnceLock::new();

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

pub fn activate() -> Result<(), String> {
    if unsafe { orbit_push_activate() } {
        Ok(())
    } else {
        Err("Cannot read Windows notification activation".into())
    }
}

pub fn initialize(
    app: &AppHandle,
    callback: extern "C" fn(i32, *const u8, usize),
) -> Result<(), String> {
    if INITIALIZED.get().is_some() {
        return Ok(());
    }
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("windows-app-sdk-1.7");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let bootstrap = directory.join("Microsoft.WindowsAppRuntime.Bootstrap.dll");
    let installer = directory.join("WindowsAppRuntimeInstall.exe");
    let embedded = include_bytes!(env!("ORBIT_WNS_BOOTSTRAP"));
    if std::fs::read(&bootstrap).ok().as_deref() != Some(embedded.as_slice()) {
        std::fs::write(&bootstrap, embedded).map_err(|error| error.to_string())?;
    }
    let object_id = CString::new(option_env!("ORBIT_DESKTOP_WNS_OBJECT_ID").unwrap_or(""))
        .map_err(|error| error.to_string())?;
    let path = bootstrap
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let initialize =
        || unsafe { orbit_wns_initialize(path.as_ptr(), object_id.as_ptr(), callback) };
    let mut result = initialize();
    if result == 1 {
        std::fs::write(&installer, include_bytes!(env!("ORBIT_WNS_INSTALLER")))
            .map_err(|error| error.to_string())?;
        use std::os::windows::process::CommandExt;
        let installed = std::process::Command::new(&installer)
            .arg("--quiet")
            .creation_flags(0x08000000)
            .status()
            .map_err(|error| error.to_string())?;
        if !installed.success() {
            return Err("Cannot install Windows App SDK runtime".into());
        }
        result = initialize();
    }
    if result != 0 {
        return Err("Cannot initialize Windows push notifications".into());
    }
    let _ = INITIALIZED.set(());
    Ok(())
}

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
