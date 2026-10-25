#[derive(Default)]
pub enum UpdateState<T> {
    #[default]
    Idle,
    Checking,
    Ready(T),
    Installing,
}

impl<T> UpdateState<T> {
    pub fn begin_check(&mut self) -> bool {
        if !matches!(self, Self::Idle) {
            return false;
        }
        *self = Self::Checking;
        true
    }

    pub fn checked(&mut self, downloaded: Option<T>) {
        assert!(matches!(self, Self::Checking));
        *self = downloaded.map_or(Self::Idle, Self::Ready);
    }

    pub fn request_install(&mut self) -> Option<T> {
        match std::mem::replace(self, Self::Installing) {
            Self::Ready(downloaded) => Some(downloaded),
            previous => {
                *self = previous;
                None
            }
        }
    }

    pub fn install_failed(&mut self, downloaded: T) {
        assert!(matches!(self, Self::Installing));
        *self = Self::Ready(downloaded);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_and_timer_checks_never_install_or_replace_a_pending_update() {
        let mut state = UpdateState::Idle;
        assert!(state.begin_check());
        assert!(!state.begin_check());
        assert_eq!(state.request_install(), None);
        state.checked(Some("verified package"));
        for _ in 0..3 {
            assert!(!state.begin_check());
            assert!(matches!(state, UpdateState::Ready("verified package")));
        }
        assert_eq!(state.request_install(), Some("verified package"));
        assert!(!state.begin_check());
        assert_eq!(state.request_install(), None);
    }

    #[test]
    fn offline_invalid_signature_and_no_update_results_allow_a_later_check() {
        let mut state: UpdateState<&str> = UpdateState::Idle;
        for _ in 0..3 {
            assert!(state.begin_check());
            state.checked(None);
            assert_eq!(state.request_install(), None);
        }
    }

    #[test]
    fn failed_install_preserves_the_verified_package_for_an_explicit_retry() {
        let mut state = UpdateState::Ready(vec![1, 2, 3]);
        let package = state.request_install().unwrap();
        state.install_failed(package);
        assert!(!state.begin_check());
        assert_eq!(state.request_install(), Some(vec![1, 2, 3]));
    }
}
