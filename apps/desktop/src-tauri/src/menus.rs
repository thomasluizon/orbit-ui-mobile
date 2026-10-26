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
    let labels = Labels::new(&sys_locale::get_locale().unwrap_or_default());
    let enabled = app.autolaunch().is_enabled()?;
    let check_updates = MenuItem::with_id(
        app,
        "check-updates",
        labels.text("updateCheck"),
        false,
        None::<&str>,
    )?;
    let restart = MenuItem::with_id(
        app,
        "restart-update",
        labels.text("updateRestart"),
        false,
        None::<&str>,
    )?;
    let tray_restart = MenuItem::with_id(
        app,
        "restart-update",
        labels.text("updateRestart"),
        false,
        None::<&str>,
    )?;
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
            &Submenu::with_id_and_items(
                app,
                HELP_SUBMENU_ID,
                labels.text("help"),
                true,
                &[
                    &MenuItem::with_id(app, "support", labels.text("support"), true, None::<&str>)?,
                    #[cfg(not(target_os = "macos"))]
                    &about_item(app, &labels)?,
                ],
            )?,
        ],
    )?)?;
    let tray = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", labels.text("open"), true, None::<&str>)?,
            &tray_restart,
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
    app.manage(DesktopMenu {
        labels,
        autostart,
        login: Mutex::new(LoginSetting { enabled }),
        check_updates,
        restart_updates: [restart, tray_restart],
    });
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
            updates::check(app);
            Ok(())
        }
        "restart-update" => {
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
    let check_label = if busy {
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
        .set_enabled(enabled && !busy && !status.checking)?;
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
    let mut login = menu.login.lock().unwrap();
    let manager = app.autolaunch();
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
    menu.autostart.set_checked(login.enabled)?;
    menu.autostart
        .set_text(menu.labels.text(if result.is_ok() {
            "autostart"
        } else {
            "autostartRetry"
        }))?;
    result?;
    Ok(())
}
