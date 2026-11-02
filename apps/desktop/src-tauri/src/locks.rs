use std::sync::{Mutex, MutexGuard};

pub trait RecoverLock<T> {
    fn recover_lock(&self) -> MutexGuard<'_, T>;
}

impl<T> RecoverLock<T> for Mutex<T> {
    fn recover_lock(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|poisoned| {
            eprintln!("Desktop state: recovering a poisoned lock");
            poisoned.into_inner()
        })
    }
}
