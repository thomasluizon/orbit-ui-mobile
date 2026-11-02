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
    TrayIconBuilder::with_id("orbit")
        .icon(
            app.default_window_icon()
                .ok_or("Desktop requires an icon")?
                .clone(),
        )
        .tooltip(app.config().product_name.as_deref().unwrap_or("Orbit"))
        .menu(&tray)
        .show_menu_on_left_click(true)
        .build(app)?;
    Ok(())
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
