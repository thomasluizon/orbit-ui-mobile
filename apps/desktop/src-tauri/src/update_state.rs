use serde::Serialize;
use std::collections::HashSet;
use uuid::Uuid;

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
    pub prompt_pending: bool,
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
    install_reservation: Option<Uuid>,
    deferred: Option<(Option<String>, Option<String>)>,
    prompted_versions: HashSet<String>,
    prompt_open: bool,
    install_on_quit: bool,
    pub quit_requested: bool,
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
            install_reservation: None,
            deferred: None,
            prompted_versions: HashSet::new(),
            prompt_open: false,
            install_on_quit: false,
            quit_requested: false,
        }
    }

    pub fn begin_check(&mut self) -> bool {
        if !self.enabled
            || self.checking
            || self.busy()
            || self.install_reservation.is_some()
            || self.prompt_pending()
            || self.quit_requested
            || self.install_on_quit
        {
            return false;
        }
        self.checking = true;
        true
    }

    pub fn checked(&mut self, candidate: Result<Option<(String, T)>, ()>) {
        self.checking = false;
        self.check_failed = candidate.is_err();
        if self.busy()
            || self.install_reservation.is_some()
            || self.prompt_pending()
            || self.quit_requested
            || self.install_on_quit
        {
            return;
        }
        if let Ok(Some((version, package))) = candidate {
            if self.version.as_ref() != Some(&version) {
                self.version = Some(version);
                self.package = Some(package);
                self.phase = Phase::Available;
                self.install_on_quit = false;
            }
        }
    }

    pub fn begin_download(&mut self, reservation: Uuid) -> Result<T, &'static str> {
        if self.prompt_pending() {
            return Err("Desktop update awaits native confirmation");
        }
        if self.busy() {
            return Err("Desktop update already in progress");
        }
        let package = self
            .package
            .take()
            .ok_or("No desktop shell update available")?;
        self.clear_restart();
        self.install_reservation = Some(reservation);
        self.phase = Phase::Downloading;
        Ok(package)
    }

    pub fn downloaded(&mut self, package: T, verified: bool) {
        self.package = Some(package);
        if !verified {
            self.install_reservation = None;
        }
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
        if self.prompt_pending() {
            return Err("Desktop update awaits native confirmation");
        }
        let package = self
            .package
            .take()
            .ok_or("Missing desktop update package")?;
        self.phase = Phase::Installing;
        self.install_reservation = None;
        Ok(package)
    }

    pub fn install_failed(&mut self, package: T) {
        self.package = Some(package);
        self.phase = Phase::Failed;
        self.install_reservation = None;
        self.install_on_quit = false;
        self.quit_requested = false;
        self.restart_requested = false;
    }

    pub fn installed(&mut self) {
        self.phase = Phase::Idle;
        self.install_on_quit = false;
        self.quit_requested = false;
        self.restart_requested = false;
    }

    fn prompt_pending(&self) -> bool {
        self.phase == Phase::Downloaded
            && (self.prompt_open
                || self
                    .version
                    .as_ref()
                    .is_some_and(|version| !self.prompted_versions.contains(version)))
    }

    pub fn take_prompt(&mut self, visible: bool) -> Option<String> {
        if !visible || self.phase != Phase::Downloaded || self.prompt_open {
            return None;
        }
        let version = self.version.as_ref()?;
        if !self.prompted_versions.insert(version.clone()) {
            return None;
        }
        self.prompt_open = true;
        Some(version.clone())
    }

    pub fn answer_prompt(&mut self, version: &str, restart: bool) {
        if !self.prompt_open || self.version.as_deref() != Some(version) {
            return;
        }
        self.prompt_open = false;
        self.install_reservation = None;
        if restart {
            self.request_restart();
        } else {
            self.defer();
        }
    }

    pub fn request_quit(&mut self) -> bool {
        if self.phase == Phase::Installing || self.quit_requested {
            return true;
        }
        if !self.install_on_quit || self.phase != Phase::Downloaded {
            return false;
        }
        self.quit_requested = true;
        self.restart_requested = true;
        self.deferred = None;
        self.install_reservation = None;
        true
    }

    pub fn busy(&self) -> bool {
        matches!(self.phase, Phase::Downloading | Phase::Installing)
    }

    pub fn reveal(&mut self) {
        self.deferred = None;
    }

    pub fn request_restart(&mut self) {
        if !self.busy()
            && self.install_reservation.is_none()
            && !self.prompt_pending()
            && (self.version.is_some() || self.web_commit.is_some())
        {
            self.restart_requested = true;
            self.deferred = None;
            self.quit_requested = false;
        }
    }

    pub fn defer(&mut self) {
        if !self.busy() {
            self.deferred = Some((self.version.clone(), self.web_commit.clone()));
            self.restart_requested = false;
            self.install_reservation = None;
            self.install_on_quit = self.phase == Phase::Downloaded && !self.prompt_pending();
            self.quit_requested = false;
        }
    }

    pub fn clear_restart(&mut self) {
        self.restart_requested = false;
    }

    pub fn release_install(&mut self, reservation: Uuid) {
        if self.install_reservation == Some(reservation) {
            self.install_reservation = None;
            self.quit_requested = false;
        }
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
            prompt_pending: self.prompt_pending(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RESERVATION: Uuid = Uuid::from_u128(1);

    #[test]
    fn ready_package_waits_for_native_confirmation() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        let snapshot = serde_json::to_value(state.snapshot()).unwrap();
        assert_eq!(snapshot["promptPending"], true);
        assert!(!state.snapshot().restart_requested);
        assert!(state.begin_install().is_err());
    }

    fn confirm_restart<T>(state: &mut UpdateState<T>) {
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, true);
    }

    #[test]
    fn ready_prompts_once_per_version_and_hidden_windows_defer_until_show() {
        let mut state = UpdateState::new(true);
        assert_eq!(state.take_prompt(true), None);
        for version in ["0.2.0", "0.3.0", "0.2.0"] {
            state.checked(Ok(Some((version.into(), "package"))));
            let package = state.begin_download(RESERVATION).unwrap();
            state.downloaded(package, true);
            assert_eq!(state.take_prompt(false), None);
            if version == "0.2.0" && state.prompted_versions.contains(version) {
                assert_eq!(state.take_prompt(true), None);
            } else {
                assert_eq!(state.take_prompt(true).as_deref(), Some(version));
                assert_eq!(state.take_prompt(true), None);
                assert!(state.snapshot().prompt_pending);
                state.answer_prompt(version, true);
                assert_eq!(state.take_prompt(true), None);
            }
            state.release_install(RESERVATION);
        }
    }

    #[test]
    fn restart_now_requests_the_web_settle_handoff_before_installation() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        confirm_restart(&mut state);
        assert!(state.snapshot().restart_requested);
        assert_eq!(state.phase, Phase::Downloaded);
        assert_eq!(state.package, Some("package"));
        assert!(!state.request_quit());
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        assert_eq!(state.take_prompt(true), None);
        assert_eq!(state.begin_install().unwrap(), "package");
    }

    #[test]
    fn later_or_dismissal_installs_on_quit_and_failure_retains_explicit_retry() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "verified package"))));
        assert!(!state.request_quit());
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        assert!(!state.request_quit());
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, false);
        assert!(!state.snapshot().restart_requested);
        assert!(state.snapshot().deferred);
        assert!(state.request_quit());
        assert!(state.quit_requested);
        assert!(state.snapshot().restart_requested);
        assert_eq!(state.phase, Phase::Downloaded);
        state.clear_restart();
        assert!(state.request_quit());
        assert!(!state.snapshot().restart_requested);
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        assert!(state.quit_requested);
        let package = state.begin_install().unwrap();
        state.install_failed(package);
        assert_eq!(state.phase, Phase::Failed);
        assert_eq!(state.package, Some("verified package"));
        assert!(!state.quit_requested);
        assert!(!state.request_quit());
        assert!(!state.snapshot().restart_requested);
        state.request_restart();
        assert!(state.snapshot().restart_requested);
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        assert_eq!(state.take_prompt(true), None);
        assert_eq!(state.begin_install().unwrap(), "verified package");
        state.installed();
        assert!(!state.request_quit());
    }

    #[test]
    fn cancelling_a_quit_checkpoint_allows_another_explicit_quit_attempt() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, false);
        assert!(state.request_quit());
        state.clear_restart();
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        state.release_install(RESERVATION);
        assert!(!state.quit_requested);
        assert!(state.request_quit());
        assert!(state.snapshot().restart_requested);
    }

    #[test]
    fn later_keeps_the_verified_package_when_a_newer_check_finishes() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "verified package"))));
        assert!(state.begin_check());
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, false);
        state.checked(Ok(Some(("0.3.0".into(), "unverified package"))));
        assert_eq!(state.version.as_deref(), Some("0.2.0"));
        assert_eq!(state.package, Some("verified package"));
        assert!(!state.begin_check());
        assert!(state.request_quit());
    }

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
        assert!(state.begin_download(RESERVATION).is_err());
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        assert!(state.begin_install().is_err());
        assert!(state.begin_download(RESERVATION).is_err());
        state.checked(Ok(Some(("0.3.0".into(), "racing check"))));
        state.downloaded(package, false);
        assert_eq!(state.phase, Phase::Failed);
        assert!(state.begin_install().is_err());
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        confirm_restart(&mut state);
        let verified = state.begin_install().unwrap();
        assert!(!state.begin_check());
        state.install_failed(verified);
        assert_eq!(state.phase, Phase::Failed);
        let verified = state.begin_download(RESERVATION).unwrap();
        assert_eq!(verified, "package");
        state.downloaded(verified, true);
        assert_eq!(state.begin_install().unwrap(), "package");
    }

    #[test]
    fn downloaded_candidate_survives_a_newer_check_during_install_handoff() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "accepted package"))));
        assert!(state.begin_check());
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        state.checked(Ok(Some(("0.3.0".into(), "newer package"))));
        assert_eq!(state.phase, Phase::Downloaded);
        state.request_restart();
        assert!(!state.snapshot().restart_requested);
        state.clear_restart();
        assert!(!state.begin_check());
        assert_eq!(state.version.as_deref(), Some("0.2.0"));
        confirm_restart(&mut state);
        let package = state.begin_install().unwrap();
        assert_eq!(package, "accepted package");
        state.install_failed(package);
        assert!(state.begin_check());
        state.checked(Ok(Some(("0.3.0".into(), "newer package"))));
        assert_eq!(state.phase, Phase::Available);
    }

    #[test]
    fn later_pins_the_quit_package_while_cancel_allows_newer_offers() {
        for defer in [true, false] {
            let mut state = UpdateState::new(true);
            state.checked(Ok(Some(("0.2.0".into(), "package"))));
            let package = state.begin_download(RESERVATION).unwrap();
            state.downloaded(package, true);
            confirm_restart(&mut state);
            if defer {
                state.defer();
                assert!(state.snapshot().deferred);
                assert!(!state.begin_check());
            } else {
                state.release_install(RESERVATION);
                assert!(state.begin_check());
            }
            state.checked(Ok(Some(("0.3.0".into(), "newer package"))));
            assert_eq!(state.snapshot().deferred, defer);
            assert_eq!(
                state.version.as_deref(),
                Some(if defer { "0.2.0" } else { "0.3.0" })
            );
        }
    }

    #[test]
    fn stale_release_preserves_the_successor_reservation_and_downloaded_package() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "accepted package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        confirm_restart(&mut state);
        state.release_install(RESERVATION);
        let successor = Uuid::from_u128(2);
        let package = state.begin_download(successor).unwrap();
        state.downloaded(package, true);
        state.release_install(RESERVATION);
        assert!(!state.begin_check());
        state.checked(Ok(Some(("0.3.0".into(), "newer package"))));
        assert_eq!(state.version.as_deref(), Some("0.2.0"));
        assert_eq!(state.begin_install().unwrap(), "accepted package");
    }

    #[test]
    fn released_download_completion_does_not_reacquire_a_reservation() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "accepted package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.release_install(RESERVATION);
        assert!(!state.begin_check());
        state.downloaded(package, true);
        assert!(!state.begin_check());
        confirm_restart(&mut state);
        assert!(state.begin_check());
        state.release_install(RESERVATION);
        state.checked(Ok(Some(("0.3.0".into(), "newer package"))));
        assert_eq!(state.version.as_deref(), Some("0.3.0"));
        assert_eq!(state.phase, Phase::Available);
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
                "promptPending": false,
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
