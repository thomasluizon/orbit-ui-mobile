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
