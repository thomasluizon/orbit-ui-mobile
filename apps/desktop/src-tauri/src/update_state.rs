use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Idle,
    Available,
    Downloading,
    Downloaded,
    Installing,
    Failed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub phase: Phase,
    pub shell_version: Option<String>,
    pub web_commit: Option<String>,
    pub deferred: bool,
    pub restart_requested: bool,
    pub checking: bool,
    pub check_failed: bool,
}

pub struct UpdateState<T> {
    pub package: Option<T>,
    pub phase: Phase,
    pub version: Option<String>,
    pub web_commit: Option<String>,
    pub checking: bool,
    pub check_failed: bool,
    pub enabled: bool,
    restart_requested: bool,
    deferred: Option<(Option<String>, Option<String>)>,
}

impl<T> UpdateState<T> {
    pub fn new(enabled: bool) -> Self {
        Self {
            package: None,
            phase: Phase::Idle,
            version: None,
            web_commit: None,
            checking: false,
            check_failed: false,
            enabled,
            restart_requested: false,
            deferred: None,
        }
    }

    pub fn begin_check(&mut self) -> bool {
        if !self.enabled || self.checking || self.busy() {
            return false;
        }
        self.checking = true;
        true
    }

    pub fn checked(&mut self, candidate: Result<Option<(String, T)>, ()>) {
        self.checking = false;
        self.check_failed = candidate.is_err();
        if self.busy() {
            return;
        }
        if let Ok(Some((version, package))) = candidate {
            if self.version.as_ref() != Some(&version) {
                self.version = Some(version);
                self.package = Some(package);
                self.phase = Phase::Available;
            }
        }
    }

    pub fn begin_download(&mut self) -> Result<T, &'static str> {
        if self.busy() {
            return Err("Desktop update already in progress");
        }
        let package = self
            .package
            .take()
            .ok_or("No desktop shell update available")?;
        self.clear_restart();
        self.phase = Phase::Downloading;
        Ok(package)
    }

    pub fn downloaded(&mut self, package: T, verified: bool) {
        self.package = Some(package);
        self.phase = if verified {
            Phase::Downloaded
        } else {
            Phase::Failed
        };
    }

    pub fn begin_install(&mut self) -> Result<T, &'static str> {
        if self.phase != Phase::Downloaded {
            return Err("Desktop update is not downloaded");
        }
        let package = self
            .package
            .take()
            .ok_or("Missing desktop update package")?;
        self.phase = Phase::Installing;
        Ok(package)
    }

    pub fn install_failed(&mut self, package: T) {
        self.package = Some(package);
        self.phase = Phase::Failed;
    }

    pub fn busy(&self) -> bool {
        matches!(self.phase, Phase::Downloading | Phase::Installing)
    }

    pub fn reveal(&mut self) {
        self.deferred = None;
    }

    pub fn request_restart(&mut self) {
        if !self.busy() && (self.version.is_some() || self.web_commit.is_some()) {
            self.restart_requested = true;
            self.deferred = None;
        }
    }

    pub fn defer(&mut self) {
        if !self.busy() {
            self.deferred = Some((self.version.clone(), self.web_commit.clone()));
            self.restart_requested = false;
        }
    }

    pub fn clear_restart(&mut self) {
        self.restart_requested = false;
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            phase: self.phase,
            shell_version: self.version.clone(),
            web_commit: self.web_commit.clone(),
            deferred: self.deferred.as_ref()
                == Some(&(self.version.clone(), self.web_commit.clone())),
            restart_requested: self.restart_requested,
            checking: self.checking,
            check_failed: self.check_failed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_focus_and_timer_checks_do_not_download_or_install() {
        let mut state = UpdateState::new(true);
        assert!(state.begin_check());
        assert!(!state.begin_check());
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        assert_eq!(state.phase, Phase::Available);
        assert!(!state.snapshot().restart_requested);
        assert!(state.begin_check());
        state.checked(Ok(Some(("0.2.0".into(), "same package"))));
        assert_eq!(state.package, Some("package"));
        state.phase = Phase::Downloading;
        assert!(!state.begin_check());
        state.phase = Phase::Installing;
        assert!(!state.begin_check());
    }

    #[test]
    fn opening_the_native_offer_reveals_it_without_requesting_installation() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        state.defer();
        assert!(state.snapshot().deferred);
        state.reveal();
        assert!(!state.snapshot().deferred);
        assert!(!state.snapshot().restart_requested);
        assert_eq!(state.phase, Phase::Available);
    }

    #[test]
    fn download_and_install_failures_keep_the_package_for_explicit_retry() {
        let mut state = UpdateState::new(true);
        assert!(state.begin_install().is_err());
        assert!(state.begin_download().is_err());
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download().unwrap();
        assert!(state.begin_install().is_err());
        assert!(state.begin_download().is_err());
        state.checked(Ok(Some(("0.3.0".into(), "racing check"))));
        state.downloaded(package, false);
        assert_eq!(state.phase, Phase::Failed);
        assert!(state.begin_install().is_err());
        let package = state.begin_download().unwrap();
        state.downloaded(package, true);
        let verified = state.begin_install().unwrap();
        assert!(!state.begin_check());
        state.install_failed(verified);
        assert_eq!(state.phase, Phase::Failed);
        let verified = state.begin_download().unwrap();
        assert_eq!(verified, "package");
        state.downloaded(verified, true);
        assert_eq!(state.begin_install().unwrap(), "package");
    }

    #[test]
    fn serialized_status_matches_the_web_bridge_contract() {
        let state = UpdateState::<()>::new(true);
        let snapshot = serde_json::to_value(state.snapshot()).unwrap();
        assert_eq!(
            snapshot,
            serde_json::json!({
                "phase": "idle", "shellVersion": null, "webCommit": null,
                "deferred": false, "restartRequested": false, "checking": false, "checkFailed": false,
            })
        );
    }

    #[test]
    fn later_lasts_until_a_new_web_or_shell_release_or_process_launch() {
        let mut state = UpdateState::new(true);
        state.web_commit = Some("first".into());
        state.defer();
        assert!(state.snapshot().deferred);
        assert!(state.begin_check());
        state.checked(Ok(None::<(String, ())>));
        assert!(state.snapshot().deferred);
        state.web_commit = Some("second".into());
        assert!(!state.snapshot().deferred);
        state.defer();
        assert!(state.snapshot().deferred);
        state.checked(Ok(Some(("0.2.0".into(), ()))));
        assert!(!state.snapshot().deferred);
        state.defer();
        state.request_restart();
        assert!(!state.snapshot().deferred);
        assert!(state.snapshot().restart_requested);
        assert!(!UpdateState::<()>::new(true).snapshot().deferred);
    }

    #[test]
    fn failed_checks_preserve_an_offer_and_remain_retryable() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        state.checked(Err(()));
        assert!(state.snapshot().check_failed);
        assert_eq!(state.package, Some("package"));
        assert!(state.begin_check());
        state.checked(Ok(None));
        assert!(!state.snapshot().check_failed);
        assert!(!UpdateState::<()>::new(false).begin_check());
    }
}
