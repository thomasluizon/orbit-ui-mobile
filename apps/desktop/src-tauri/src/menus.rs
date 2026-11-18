use crate::locks::RecoverLock;
use crate::{
    lifecycle,
    localization::Labels,
    settings::LoginSetting,
    update_state::{Phase, Snapshot},
    updates,
};
use std::sync::Mutex;
use tauri::{
    menu::{
        CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
        WINDOW_SUBMENU_ID,
    },
    tray::TrayIconBuilder,
    AppHandle, Manager,
};
use tauri_plugin_autostart::ManagerExt;

struct DesktopMenu {
    labels: Labels,
    autostart: CheckMenuItem<tauri::Wry>,
    login: Mutex<LoginSetting>,
    check_updates: MenuItem<tauri::Wry>,
    restart_updates: [MenuItem<tauri::Wry>; 2],
}

pub fn install(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_menu(app)?;
    build_tray(app, &menu.labels, &menu.restart_updates[1])?;
    app.manage(menu);
    Ok(())
}

fn update_item(
    app: &AppHandle,
    labels: &Labels,
    id: &str,
    label: &str,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, id, labels.text(label), false, None::<&str>)
}

fn build_menu(app: &AppHandle) -> Result<DesktopMenu, Box<dyn std::error::Error>> {
    let labels = Labels::new(&sys_locale::get_locale().unwrap_or_default());
    let enabled = app.autolaunch().is_enabled()?;
    let check_updates = update_item(app, &labels, "check-updates", "updateCheck")?;
    let restart = update_item(app, &labels, "restart-update", "updateRestart")?;
    let tray_restart = update_item(app, &labels, "tray-restart-update", "updateRestart")?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        labels.text("autostart"),
        true,
        enabled,
        None::<&str>,
    )?;
    app.set_menu(Menu::with_items(
        app,
        &[
            &application_menu(app, &labels, &autostart, &check_updates, &restart)?,
            &edit_menu(app, &labels)?,
            &view_menu(app, &labels)?,
            &window_menu(app, &labels)?,
            &help_menu(app, &labels)?,
        ],
    )?)?;
    Ok(DesktopMenu {
        labels,
        autostart,
        login: Mutex::new(LoginSetting { enabled }),
        check_updates,
        restart_updates: [restart, tray_restart],
    })
}

fn help_menu(app: &AppHandle, labels: &Labels) -> tauri::Result<Submenu<tauri::Wry>> {
    Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        labels.text("help"),
        true,
        &[
            &MenuItem::with_id(app, "support", labels.text("support"), true, None::<&str>)?,
            #[cfg(not(target_os = "macos"))]
            &about_item(app, labels)?,
        ],
    )
}

fn build_tray(
    app: &AppHandle,
    labels: &Labels,
    restart: &MenuItem<tauri::Wry>,
) -> Result<(), Box<dyn std::error::Error>> {
    let tray = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", labels.text("open"), true, None::<&str>)?,
            restart,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", labels.text("quit"), true, None::<&str>)?,
        ],
    )?;
    // The tray draws the small static face, because the live rig of the app icon has eyes under
    // 2px at a tray size. The macOS menu bar draws tray.png 18pt tall.
    #[cfg(target_os = "macos")]
    let icon = tauri::include_image!("icons/tray.png");
    #[cfg(windows)]
    let icon = windows_tray_icon();
    TrayIconBuilder::with_id("orbit")
        .icon(icon)
        .tooltip(app.config().product_name.as_deref().unwrap_or("Orbit"))
        .menu(&tray)
        .show_menu_on_left_click(true)
        .build(app)?;
    Ok(())
}

/// The sizes of the Windows tray images: SM_CXSMICON at 100%, 125%, 150%, 175%, 200%, 250% and
/// 300% display scale. tools/generate-brand-assets.mjs writes one icons/tray-windows-<size>.png each.
#[cfg(any(windows, test))]
const WINDOWS_TRAY_SIZES: [i32; 7] = [16, 20, 24, 28, 32, 40, 48];

/// The largest Windows tray image no larger than the small icon size, so the notification area
/// only ever enlarges it and each eye stays at least 2px wide. `GetSystemMetrics` returns 0 on
/// failure, which takes the 16px image.
#[cfg(any(windows, test))]
fn windows_tray_size(small_icon_size: i32) -> i32 {
    WINDOWS_TRAY_SIZES
        .into_iter()
        .rev()
        .find(|size| *size <= small_icon_size)
        .unwrap_or(WINDOWS_TRAY_SIZES[0])
}

/// The notification area draws the tray image at SM_CXSMICON, the small icon size of the system
/// DPI (NOTIFYICONDATAW). tray-icon 0.25.1 passes the image to CreateIcon at its own size, and the
/// icon.ico layer that `default_window_icon()` loads is the SM_CXICON one, which draws the live rig
/// at 48 and 64px.
#[cfg(windows)]
fn windows_tray_icon() -> tauri::image::Image<'static> {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetSystemMetrics(index: i32) -> i32;
    }
    const SM_CXSMICON: i32 = 49;
    windows_tray_image(windows_tray_size(unsafe { GetSystemMetrics(SM_CXSMICON) }))
}

#[cfg(any(windows, test))]
fn windows_tray_image(size: i32) -> tauri::image::Image<'static> {
    match size {
        16 => tauri::include_image!("icons/tray-windows-16.png"),
        20 => tauri::include_image!("icons/tray-windows-20.png"),
        24 => tauri::include_image!("icons/tray-windows-24.png"),
        28 => tauri::include_image!("icons/tray-windows-28.png"),
        32 => tauri::include_image!("icons/tray-windows-32.png"),
        40 => tauri::include_image!("icons/tray-windows-40.png"),
        _ => tauri::include_image!("icons/tray-windows-48.png"),
    }
}

fn application_menu(
    app: &AppHandle,
    labels: &Labels,
    autostart: &CheckMenuItem<tauri::Wry>,
    check_updates: &MenuItem<tauri::Wry>,
    restart: &MenuItem<tauri::Wry>,
) -> tauri::Result<Submenu<tauri::Wry>> {
    #[cfg(target_os = "macos")]
    let title = app.config().product_name.as_deref().unwrap_or("Orbit");
    #[cfg(not(target_os = "macos"))]
    let title = labels.text("file");
    Submenu::with_items(
        app,
        title,
        true,
        &[
            #[cfg(target_os = "macos")]
            &about_item(app, labels)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "preferences",
                labels.text("preferences"),
                true,
                Some("CmdOrCtrl+Comma"),
            )?,
            autostart,
            check_updates,
            restart,
            &PredefinedMenuItem::separator(app)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::services(app, Some(labels.text("services")))?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::hide(app, Some(labels.text("hide")))?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::hide_others(app, Some(labels.text("hideOthers")))?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::show_all(app, Some(labels.text("showAll")))?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::close_window(app, Some(labels.text("close")))?,
            &MenuItem::with_id(
                app,
                "quit",
                labels.text(if cfg!(target_os = "macos") {
                    "quitMac"
                } else {
                    "quitWindows"
                }),
                true,
                Some("CmdOrCtrl+Q"),
            )?,
        ],
    )
}

fn about_item(app: &AppHandle, labels: &Labels) -> tauri::Result<PredefinedMenuItem<tauri::Wry>> {
    PredefinedMenuItem::about(
        app,
        Some(labels.text("about")),
        Some(tauri::menu::AboutMetadata {
            name: app.config().product_name.clone(),
            version: Some(app.package_info().version.to_string()),
            ..Default::default()
        }),
    )
}

fn edit_menu(app: &AppHandle, labels: &Labels) -> tauri::Result<Submenu<tauri::Wry>> {
    Submenu::with_items(
        app,
        labels.text("edit"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(labels.text("undo")))?,
            &PredefinedMenuItem::redo(app, Some(labels.text("redo")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(labels.text("cut")))?,
            &PredefinedMenuItem::copy(app, Some(labels.text("copy")))?,
            &PredefinedMenuItem::paste(app, Some(labels.text("paste")))?,
            &PredefinedMenuItem::select_all(app, Some(labels.text("selectAll")))?,
        ],
    )
}

fn view_menu(app: &AppHandle, labels: &Labels) -> tauri::Result<Submenu<tauri::Wry>> {
    Submenu::with_items(
        app,
        labels.text("view"),
        true,
        &[
            &MenuItem::with_id(
                app,
                "palette",
                labels.text("palette"),
                true,
                Some("CmdOrCtrl+K"),
            )?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::fullscreen(app, Some(labels.text("fullscreen")))?,
        ],
    )
}

fn window_menu(app: &AppHandle, labels: &Labels) -> tauri::Result<Submenu<tauri::Wry>> {
    Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        labels.text("window"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(labels.text("minimize")))?,
            &PredefinedMenuItem::maximize(
                app,
                Some(labels.text(if cfg!(target_os = "macos") {
                    "zoom"
                } else {
                    "maximize"
                })),
            )?,
            &PredefinedMenuItem::close_window(app, Some(labels.text("close")))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "open", labels.text("open"), true, None::<&str>)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::bring_all_to_front(app, Some(labels.text("bringAllToFront")))?,
        ],
    )
}

pub fn handle(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let result = match event.id().as_ref() {
        "open" => lifecycle::show_main(app).map_err(Into::into),
        "palette" => lifecycle::open_palette(app),
        "preferences" => lifecycle::navigate(app, "/profile/preferences"),
        "support" => lifecycle::navigate(app, "/support"),
        "autostart" => toggle_autostart(app),
        "check-updates" => {
            updates::offer_or_check(app);
            Ok(())
        }
        "restart-update" | "tray-restart-update" => {
            updates::request_restart(app);
            Ok(())
        }
        "quit" => {
            lifecycle::quit_app(app);
            Ok(())
        }
        _ => Ok(()),
    };
    if let Err(error) = result {
        eprintln!("Desktop menu action failed: {error}");
    }
}

pub fn update_status(app: &AppHandle, status: &Snapshot, enabled: bool) -> tauri::Result<()> {
    let menu = app.state::<DesktopMenu>();
    let available = status.shell_version.is_some() || status.web_commit.is_some();
    let busy = matches!(status.phase, Phase::Downloading | Phase::Installing);
    let check_label = if status.phase == Phase::Downloading {
        "updateDownloading"
    } else if busy {
        "updateInstalling"
    } else if available {
        "updateReady"
    } else if status.checking {
        "updateChecking"
    } else if status.check_failed {
        "updateCheckRetry"
    } else if enabled {
        "updateCurrent"
    } else {
        "updateUnavailable"
    };
    menu.check_updates.set_text(menu.labels.text(check_label))?;
    menu.check_updates
        .set_enabled((enabled || available) && !busy && !status.checking)?;
    for restart in &menu.restart_updates {
        restart.set_text(menu.labels.text(if status.phase == Phase::Failed {
            "updateRestartRetry"
        } else {
            "updateRestart"
        }))?;
        restart.set_enabled(available && !busy)?;
    }
    Ok(())
}

fn toggle_autostart(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = app.state::<DesktopMenu>();
    let manager = app.autolaunch();
    let (result, enabled) = {
        let mut login = menu.login.recover_lock();
        let result = login.toggle(
            || manager.is_enabled(),
            |next| {
                if next {
                    manager.enable()
                } else {
                    manager.disable()
                }
            },
        );
        (result, login.enabled)
    };
    if let Err(error) = &result {
        eprintln!("Cannot change desktop autostart: {error}");
    }
    menu.autostart.set_checked(enabled)?;
    menu.autostart
        .set_text(menu.labels.text(if result.is_ok() {
            "autostart"
        } else {
            "autostartRetry"
        }))?;
    result?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{windows_tray_image, windows_tray_size, WINDOWS_TRAY_SIZES};

    #[test]
    fn windows_tray_takes_the_largest_image_no_larger_than_the_small_icon_size() {
        let picked: Vec<i32> = [0, 16, 20, 22, 24, 28, 32, 36, 40, 48, 64]
            .into_iter()
            .map(windows_tray_size)
            .collect();
        assert_eq!(picked, [16, 16, 20, 20, 24, 28, 32, 32, 40, 48, 48]);
    }

    #[test]
    fn each_windows_tray_image_is_a_square_of_its_size() {
        for size in WINDOWS_TRAY_SIZES {
            let image = windows_tray_image(size);
            assert_eq!((image.width(), image.height()), (size as u32, size as u32));
        }
    }
}
