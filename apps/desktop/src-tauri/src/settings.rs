use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LaunchMode {
    Dark,
    Light,
}

#[derive(Default, Deserialize, Serialize)]
pub struct DesktopSettings {
    pub launch_mode: Option<LaunchMode>,
}

impl DesktopSettings {
    pub fn load(path: &Path) -> Result<Self, String> {
        let contents = match fs::read(path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default())
            }
            Err(error) => return Err(error.to_string()),
        };
        serde_json::from_slice(&contents).map_err(|error| error.to_string())
    }

    pub fn report_launch_mode(
        &mut self,
        report: Option<&str>,
        path: &Path,
        apply: impl FnOnce(LaunchMode) -> Result<(), String>,
    ) -> Result<(), String> {
        let mode = match report {
            Some("dark") => LaunchMode::Dark,
            Some("light") => LaunchMode::Light,
            _ => return Ok(()),
        };
        if self.launch_mode != Some(mode) {
            let next = Self {
                launch_mode: Some(mode),
            };
            next.save(path)?;
            self.launch_mode = next.launch_mode;
        }
        apply(mode)
    }

    fn save(&self, path: &Path) -> Result<(), String> {
        let directory = path.parent().ok_or("Missing desktop settings directory")?;
        fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        let mut file =
            tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
        file.write_all(&serde_json::to_vec(self).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        file.as_file()
            .sync_all()
            .map_err(|error| error.to_string())?;
        file.persist(path).map_err(|error| error.to_string())?;
        Ok(())
    }
}

pub fn path(app: &tauri::AppHandle) -> tauri::Result<std::path::PathBuf> {
    use tauri::Manager;
    Ok(app.path().app_config_dir()?.join("settings.json"))
}

pub struct LoginSetting {
    pub enabled: bool,
}

impl LoginSetting {
    pub fn toggle<E>(
        &mut self,
        read: impl FnOnce() -> Result<bool, E>,
        write: impl FnOnce(bool) -> Result<(), E>,
    ) -> Result<(), E> {
        self.enabled = read()?;
        let next = !self.enabled;
        write(next)?;
        self.enabled = next;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reported_modes_are_persisted_and_applied_before_reveal() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let mut settings = DesktopSettings::load(&path).unwrap();
        for (report, expected) in [("dark", LaunchMode::Dark), ("light", LaunchMode::Light)] {
            settings
                .report_launch_mode(Some(report), &path, |mode| {
                    assert_eq!(mode, expected);
                    assert_eq!(
                        DesktopSettings::load(&path).unwrap().launch_mode,
                        Some(expected)
                    );
                    Ok(())
                })
                .unwrap();
            assert_eq!(settings.launch_mode, Some(expected));
        }
    }

    #[test]
    fn invalid_reports_do_not_write_or_apply_a_mode() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let mut settings = DesktopSettings::default();
        for persisted in [false, true] {
            if persisted {
                settings
                    .report_launch_mode(Some("dark"), &path, |_| Ok(()))
                    .unwrap();
            }
            let original = fs::read(&path).ok();
            for report in [
                None,
                Some(""),
                Some("system"),
                Some("Dark"),
                Some("#09090B"),
            ] {
                settings
                    .report_launch_mode(report, &path, |_| {
                        panic!("invalid mode must not be applied")
                    })
                    .unwrap();
                assert_eq!(
                    settings.launch_mode,
                    if persisted {
                        Some(LaunchMode::Dark)
                    } else {
                        None
                    }
                );
                assert_eq!(fs::read(&path).ok(), original);
            }
        }
    }

    #[test]
    fn failed_persistence_is_reported_without_changing_or_applying_the_saved_mode() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        fs::create_dir(&path).unwrap();
        let mut settings = DesktopSettings {
            launch_mode: Some(LaunchMode::Dark),
        };
        assert!(settings
            .report_launch_mode(Some("light"), &path, |_| panic!(
                "unsaved mode must not be applied"
            ))
            .is_err());
        assert_eq!(settings.launch_mode, Some(LaunchMode::Dark));
    }

    #[test]
    fn a_repeated_mode_still_applies_and_propagates_a_native_failure() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let mut settings = DesktopSettings::default();
        settings
            .report_launch_mode(Some("dark"), &path, |_| Ok(()))
            .unwrap();
        assert_eq!(
            settings.report_launch_mode(Some("dark"), &path, |_| Err("native failure".into())),
            Err("native failure".into())
        );
        assert_eq!(
            DesktopSettings::load(&path).unwrap().launch_mode,
            Some(LaunchMode::Dark)
        );
    }

    #[test]
    fn login_registration_changes_only_on_request_and_can_be_disabled_again() {
        let mut setting = LoginSetting { enabled: false };
        setting
            .toggle(
                || Ok::<_, &str>(false),
                |next| {
                    assert!(next);
                    Ok(())
                },
            )
            .unwrap();
        assert!(setting.enabled);
        setting
            .toggle(
                || Ok::<_, &str>(true),
                |next| {
                    assert!(!next);
                    Ok(())
                },
            )
            .unwrap();
        assert!(!setting.enabled);
    }

    #[test]
    fn an_external_registration_change_is_read_before_deciding_what_to_write() {
        let mut setting = LoginSetting { enabled: false };
        setting
            .toggle(
                || Ok::<_, &str>(true),
                |next| {
                    assert!(!next);
                    Ok(())
                },
            )
            .unwrap();
        assert!(!setting.enabled);
    }

    #[test]
    fn an_unreadable_registration_does_not_write_or_change_the_last_known_setting() {
        let mut setting = LoginSetting { enabled: true };
        assert_eq!(
            setting.toggle(|| Err("cannot read"), |_| panic!("must not write")),
            Err("cannot read")
        );
        assert!(setting.enabled);
    }

    #[test]
    fn rejected_changes_keep_the_observed_os_value_for_the_checkmark() {
        for current in [false, true] {
            let mut setting = LoginSetting { enabled: !current };
            assert_eq!(
                setting.toggle(|| Ok(current), |_| Err("cannot write")),
                Err("cannot write")
            );
            assert_eq!(setting.enabled, current);
        }
    }
}
