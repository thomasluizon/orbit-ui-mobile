use serde::Serialize;
use std::{
    collections::HashSet,
    time::{Duration, Instant},
};
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

#[derive(Clone, Debug, PartialEq, Serialize)]
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

#[derive(Debug, PartialEq)]
pub enum QuitAction<T> {
    Exit,
    Wait,
    Install(T),
}

enum UpdatePhase<T> {
    Idle,
    Available(T),
    Downloading,
    Downloaded(T),
    Installing,
    Failed(T),
}

pub struct UpdateState<T> {
    phase: UpdatePhase<T>,
    last_completed: Option<Instant>,
    failures: u32,
    pub published: Option<(Snapshot, bool)>,
    pub version: Option<String>,
    pub web_commit: Option<String>,
    pub checking: bool,
    pub check_failed: bool,
    pub enabled: bool,
    restart_requested: bool,
    restart_authorized: bool,
    install_reservation: Option<Uuid>,
    deferred: Option<(Option<String>, Option<String>)>,
    prompted_versions: HashSet<String>,
    prompt_open: bool,
    install_on_quit: bool,
    pub quit_requested: bool,
    exiting: bool,
}

impl<T> UpdateState<T> {
    pub fn new(enabled: bool) -> Self {
        Self {
            phase: UpdatePhase::Idle,
            last_completed: None,
            failures: 0,
            published: None,
            version: None,
            web_commit: None,
            checking: false,
            check_failed: false,
            enabled,
            restart_requested: false,
            restart_authorized: false,
            install_reservation: None,
            deferred: None,
            prompted_versions: HashSet::new(),
            prompt_open: false,
            install_on_quit: false,
            quit_requested: false,
            exiting: false,
        }
    }

    pub fn phase(&self) -> Phase {
        match self.phase {
            UpdatePhase::Idle => Phase::Idle,
            UpdatePhase::Available(_) => Phase::Available,
            UpdatePhase::Downloading => Phase::Downloading,
            UpdatePhase::Downloaded(_) => Phase::Downloaded,
            UpdatePhase::Installing => Phase::Installing,
            UpdatePhase::Failed(_) => Phase::Failed,
        }
    }

    #[cfg(test)]
    pub fn package(&self) -> Option<&T> {
        match &self.phase {
            UpdatePhase::Available(package)
            | UpdatePhase::Downloaded(package)
            | UpdatePhase::Failed(package) => Some(package),
            _ => None,
        }
    }

    pub fn check_interval(&self) -> Duration {
        Duration::from_secs((60_u64 << self.failures.min(6)).min(3600))
    }

    pub fn check_delay(&self, now: Instant) -> Duration {
        self.last_completed
            .map(|last| {
                self.check_interval()
                    .saturating_sub(now.saturating_duration_since(last))
            })
            .unwrap_or_default()
    }

    pub fn begin_scheduled_check(&mut self, now: Instant) -> bool {
        self.check_delay(now).is_zero() && self.begin_check()
    }

    pub fn begin_check(&mut self) -> bool {
        if !self.enabled
            || self.exiting
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
        self.failures = if self.check_failed {
            self.failures.saturating_add(1)
        } else {
            0
        };
        self.last_completed = Some(Instant::now());
        if self.exiting
            || self.busy()
            || self.install_reservation.is_some()
            || self.prompt_pending()
            || self.quit_requested
            || self.install_on_quit
        {
            return;
        }
        if let Ok(Some((version, package))) = candidate {
            if self.version.as_ref() != Some(&version) {
                self.restart_authorized = false;
                self.restart_requested = false;
                self.version = Some(version);
                self.phase = UpdatePhase::Available(package);
                self.install_on_quit = false;
            }
        }
    }

    pub fn begin_download(&mut self, reservation: Uuid) -> Result<T, &'static str> {
        if self.exiting {
            return Err("Desktop application is exiting");
        }
        if self.prompt_pending() {
            return Err("Desktop update awaits native confirmation");
        }
        if self.busy() {
            return Err("Desktop update already in progress");
        }
        if !matches!(
            self.phase,
            UpdatePhase::Available(_) | UpdatePhase::Downloaded(_) | UpdatePhase::Failed(_)
        ) {
            return Err("No desktop shell update available");
        }
        let previous = std::mem::replace(&mut self.phase, UpdatePhase::Downloading);
        let package = match previous {
            UpdatePhase::Available(package)
            | UpdatePhase::Downloaded(package)
            | UpdatePhase::Failed(package) => package,
            _ => return Err("No desktop shell update available"),
        };
        self.install_reservation = Some(reservation);
        Ok(package)
    }

    pub fn downloaded(&mut self, package: T, verified: bool) {
        if !verified {
            self.install_reservation = None;
        }
        self.phase = if verified {
            UpdatePhase::Downloaded(package)
        } else {
            UpdatePhase::Failed(package)
        };
    }

    pub fn begin_install(&mut self) -> Result<T, &'static str> {
        if self.exiting {
            return Err("Desktop application is exiting");
        }
        install_guard(
            self.phase(),
            self.prompt_pending(),
            self.restart_authorized,
            self.quit_requested,
        )?;
        let previous = std::mem::replace(&mut self.phase, UpdatePhase::Installing);
        match previous {
            UpdatePhase::Downloaded(package) => {
                self.install_reservation = None;
                Ok(package)
            }
            previous => {
                self.phase = previous;
                Err("Desktop update is not downloaded")
            }
        }
    }

    pub fn install_failed(&mut self, package: T) {
        self.exiting = self.quit_requested;
        self.phase = UpdatePhase::Failed(package);
        self.install_reservation = None;
        self.install_on_quit = false;
        self.quit_requested = false;
        self.restart_requested = false;
    }

    pub fn installed(&mut self) {
        self.restart_authorized = false;
        self.exiting = self.quit_requested;
        self.phase = UpdatePhase::Idle;
        self.install_on_quit = false;
        self.quit_requested = false;
        self.restart_requested = false;
    }

    fn prompt_pending(&self) -> bool {
        self.phase() == Phase::Downloaded
            && (self.prompt_open
                || self
                    .version
                    .as_ref()
                    .is_some_and(|version| !self.prompted_versions.contains(version)))
    }

    pub fn take_prompt(&mut self, visible: bool) -> Option<String> {
        if !visible || self.phase() != Phase::Downloaded || self.prompt_open {
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

    pub fn request_quit(&mut self) -> QuitAction<T> {
        if self.phase() == Phase::Installing {
            self.quit_requested = true;
            return QuitAction::Wait;
        }
        if self.exiting {
            return QuitAction::Exit;
        }
        if !self.install_on_quit || self.phase() != Phase::Downloaded {
            self.exiting = true;
            return QuitAction::Exit;
        }
        self.quit_requested = true;
        self.restart_requested = false;
        self.deferred = None;
        self.install_reservation = None;
        match std::mem::replace(&mut self.phase, UpdatePhase::Installing) {
            UpdatePhase::Downloaded(package) => QuitAction::Install(package),
            previous => {
                self.phase = previous;
                self.exiting = true;
                QuitAction::Exit
            }
        }
    }

    pub fn busy(&self) -> bool {
        matches!(self.phase(), Phase::Downloading | Phase::Installing)
    }

    pub fn reveal(&mut self) {
        self.deferred = None;
    }

    pub fn request_restart(&mut self) {
        if self.exiting {
            return;
        }
        if self.prompt_pending() {
            // The native menu is a native confirmation, so it answers the pending dialog and drops the background download reservation (#2056).
            let Some(version) = self.version.clone() else {
                return;
            };
            self.prompted_versions.insert(version);
            self.prompt_open = false;
            self.install_reservation = None;
        }
        if !self.busy()
            && self.install_reservation.is_none()
            && !self.prompt_pending()
            && (self.version.is_some() || self.web_commit.is_some())
        {
            self.restart_authorized = true;
            self.restart_requested = true;
            self.deferred = None;
            self.quit_requested = false;
        }
    }

    pub fn defer(&mut self) {
        if !self.busy() {
            self.restart_authorized = false;
            self.deferred = Some((self.version.clone(), self.web_commit.clone()));
            self.restart_requested = false;
            self.install_reservation = None;
            self.install_on_quit = self.phase() == Phase::Downloaded && !self.prompt_pending();
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
            phase: self.phase(),
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

pub fn install_guard(
    phase: Phase,
    prompt_pending: bool,
    restart_authorized: bool,
    quitting: bool,
) -> Result<(), &'static str> {
    if phase != Phase::Downloaded {
        return Err("Desktop update is not downloaded");
    }
    if prompt_pending {
        return Err("Desktop update awaits native confirmation");
    }
    if !restart_authorized && !quitting {
        return Err("Desktop update restart was not requested");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RESERVATION: Uuid = Uuid::from_u128(1);

    #[test]
    fn failed_checks_back_off_to_an_hour_and_success_resets_spacing() {
        let mut state = UpdateState::<()>::new(true);
        for expected in [120, 240, 480, 960, 1920, 3600, 3600] {
            state.checked(Err(()));
            assert_eq!(state.check_interval(), Duration::from_secs(expected));
        }
        state.checked(Ok(None));
        assert_eq!(state.check_interval(), Duration::from_secs(60));
        let completed = state.last_completed.unwrap();
        assert!(!state.begin_scheduled_check(completed + Duration::from_secs(10)));
        assert!(state.begin_scheduled_check(completed + Duration::from_secs(60)));
        assert!(!state.begin_scheduled_check(completed + Duration::from_secs(70)));
    }

    #[test]
    fn native_menu_restart_confirms_a_ready_package_before_or_during_its_dialog() {
        for dialog_open in [false, true] {
            let mut state = UpdateState::new(true);
            state.checked(Ok(Some(("0.2.0".into(), "package"))));
            let package = state.begin_download(RESERVATION).unwrap();
            state.downloaded(package, true);
            if dialog_open {
                assert_eq!(state.take_prompt(true).as_deref(), Some("0.2.0"));
            }
            assert!(state.snapshot().prompt_pending);
            state.request_restart();
            assert!(
                state.snapshot().restart_requested,
                "dialog open {dialog_open}"
            );
            assert!(!state.snapshot().prompt_pending);
            assert_eq!(state.take_prompt(true), None);
            state.answer_prompt("0.2.0", false);
            assert!(state.snapshot().restart_requested);
            state.clear_restart();
            let package = state.begin_download(Uuid::from_u128(2)).unwrap();
            state.downloaded(package, true);
            assert_eq!(state.begin_install(), Ok("package"));
        }
    }

    #[test]
    fn later_does_not_authorize_a_page_install() {
        let mut state = ready_for_quit();
        assert!(matches!(
            state.begin_install(),
            Err("Desktop update restart was not requested")
        ));
        assert_eq!(state.phase(), Phase::Downloaded);
        assert_eq!(state.package().copied(), Some("package"));
    }

    #[test]
    fn native_approval_survives_web_acknowledgment_and_failed_install_retry() {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        confirm_restart(&mut state);
        state.clear_restart();
        assert!(!state.snapshot().restart_requested);
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        let package = state.begin_install().expect("acknowledged native approval");
        state.install_failed(package);
        assert!(!state.snapshot().restart_requested);
        state.release_install(RESERVATION);
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        assert_eq!(state.begin_install(), Ok("package"));
    }

    #[test]
    fn later_and_a_new_version_revoke_previous_native_approval() {
        let mut state = ready_for_quit();
        state.request_restart();
        state.clear_restart();
        state.defer();
        assert!(state.begin_install().is_err());
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        confirm_restart(&mut state);
        state.clear_restart();
        state.checked(Ok(Some(("0.3.0".into(), "new package"))));
        assert!(!state.restart_authorized);
        assert!(!state.snapshot().restart_requested);
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, false);
        assert!(state.begin_install().is_err());
    }

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

    fn ready_for_quit() -> UpdateState<&'static str> {
        let mut state = UpdateState::new(true);
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        let version = state.take_prompt(true).unwrap();
        state.answer_prompt(&version, false);
        state
    }

    #[test]
    fn quit_during_installing_waits_for_completion() {
        let mut state = ready_for_quit();
        assert_eq!(state.request_quit(), QuitAction::Install("package"));
        assert_eq!(state.phase(), Phase::Installing);
        assert_eq!(state.package(), None);
        assert_eq!(state.request_quit(), QuitAction::Wait);
        assert_eq!(state.request_quit(), QuitAction::Wait);
        assert!(state.begin_install().is_err());
        state.installed();
        assert_eq!(state.request_quit(), QuitAction::Exit);
    }

    #[test]
    fn quit_without_a_deferred_verified_package_exits_immediately() {
        let mut idle = UpdateState::<()>::new(true);
        assert_eq!(idle.request_quit(), QuitAction::Exit);
        for verified in [false, true] {
            let mut state = UpdateState::new(true);
            state.checked(Ok(Some(("0.2.0".into(), "package"))));
            let package = state.begin_download(RESERVATION).unwrap();
            state.downloaded(package, verified);
            assert_eq!(state.request_quit(), QuitAction::Exit);
            assert!(!state.quit_requested);
            assert!(state.begin_install().is_err());
        }
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
        assert_eq!(state.phase(), Phase::Downloaded);
        assert_eq!(state.package().copied(), Some("package"));
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        assert_eq!(state.take_prompt(true), None);
        assert_eq!(state.begin_install().unwrap(), "package");
    }

    #[test]
    fn later_or_dismissal_installs_on_quit_and_failure_retains_explicit_retry() {
        let mut state = ready_for_quit();
        assert!(!state.snapshot().restart_requested);
        assert!(state.snapshot().deferred);
        let QuitAction::Install(package) = state.request_quit() else {
            panic!("Quit must take the package without a web call");
        };
        assert_eq!(state.phase(), Phase::Installing);
        assert!(state.quit_requested);
        assert!(!state.snapshot().restart_requested);
        assert_eq!(package, "package");
        state.install_failed(package);
        assert_eq!(state.phase(), Phase::Failed);
        assert_eq!(state.package().copied(), Some("package"));
        assert_eq!(state.snapshot().shell_version.as_deref(), Some("0.2.0"));
        assert!(!state.quit_requested);
        assert!(!state.snapshot().restart_requested);
        assert_eq!(state.request_quit(), QuitAction::Exit);
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
        assert_eq!(state.package().copied(), Some("verified package"));
        assert!(!state.begin_check());
        assert_eq!(
            state.request_quit(),
            QuitAction::Install("verified package")
        );
    }

    #[test]
    fn launch_focus_and_timer_checks_do_not_download_or_install() {
        let mut state = UpdateState::new(true);
        assert!(state.begin_check());
        assert!(!state.begin_check());
        state.checked(Ok(Some(("0.2.0".into(), "package"))));
        assert_eq!(state.phase(), Phase::Available);
        assert!(!state.snapshot().restart_requested);
        assert!(state.begin_check());
        state.checked(Ok(Some(("0.2.0".into(), "same package"))));
        assert_eq!(state.package().copied(), Some("package"));
        state.phase = UpdatePhase::Downloading;
        assert!(!state.begin_check());
        state.phase = UpdatePhase::Installing;
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
        assert_eq!(state.phase(), Phase::Available);
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
        assert_eq!(state.phase(), Phase::Failed);
        assert!(state.begin_install().is_err());
        let package = state.begin_download(RESERVATION).unwrap();
        state.downloaded(package, true);
        confirm_restart(&mut state);
        let verified = state.begin_install().unwrap();
        assert!(!state.begin_check());
        state.install_failed(verified);
        assert_eq!(state.phase(), Phase::Failed);
        state.request_restart();
        let verified = state.begin_download(RESERVATION).unwrap();
        assert_eq!(verified, "package");
        state.downloaded(verified, true);
        state.request_restart();
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
        assert_eq!(state.phase(), Phase::Downloaded);
        assert!(!state.begin_check());
        assert_eq!(state.version.as_deref(), Some("0.2.0"));
        state.request_restart();
        assert!(state.snapshot().restart_requested);
        let package = state.begin_install().unwrap();
        assert_eq!(package, "accepted package");
        state.install_failed(package);
        assert!(state.begin_check());
        state.checked(Ok(Some(("0.3.0".into(), "newer package"))));
        assert_eq!(state.phase(), Phase::Available);
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
        assert_eq!(state.phase(), Phase::Available);
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
        assert_eq!(state.package().copied(), Some("package"));
        assert!(state.begin_check());
        state.checked(Ok(None));
        assert!(!state.snapshot().check_failed);
        assert!(!UpdateState::<()>::new(false).begin_check());
    }
}
