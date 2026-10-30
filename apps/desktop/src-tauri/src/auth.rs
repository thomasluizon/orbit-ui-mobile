use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use tauri::{webview::cookie::SameSite, webview::Cookie, Url};

pub type CookieOwner = Vec<(String, String)>;

pub fn is_sign_in_path(path: &str) -> bool {
    matches!(path, "/login" | "/auth-callback" | "/onboarding")
}

#[derive(Clone)]
pub struct Attempt {
    pub state: String,
    pub verifier: String,
    pub owner: CookieOwner,
    created: Instant,
}

pub struct AuthFlow {
    pub origin: Url,
    callback: Url,
    pending: Option<Attempt>,
    active: Option<String>,
    pub ready: Option<(Attempt, Vec<Cookie<'static>>)>,
}

impl AuthFlow {
    pub fn new(origin: Url, identifier: &str) -> Result<Self, &'static str> {
        let allowed = match identifier {
            "org.useorbit.desktop" => "https://app.useorbit.org/",
            "org.useorbit.desktop.staging" => "https://app-staging.useorbit.org/",
            "org.useorbit.desktop.benchmark" if cfg!(feature = "bench-loopback") => "",
            _ => return Err("Unknown desktop identifier"),
        };
        if origin.as_str() != allowed && !benchmark_origin(&origin) {
            return Err("Desktop origin does not match its identifier");
        }
        Ok(Self {
            origin,
            callback: format!("{identifier}://auth/callback").parse().unwrap(),
            pending: None,
            active: None,
            ready: None,
        })
    }

    pub fn begin(&mut self, owner: CookieOwner) -> Result<Url, &'static str> {
        let mut random = [0u8; 64];
        getrandom::fill(&mut random).map_err(|_| "Unable to create desktop proof")?;
        let state: String = random[..32]
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        let verifier = URL_SAFE_NO_PAD.encode(&random[32..]);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut url = self.origin.join("/api/auth/google/start").unwrap();
        url.query_pairs_mut()
            .append_pair("purpose", "signin")
            .append_pair("desktopState", &state)
            .append_pair("codeChallenge", &challenge);
        self.active = Some(state.clone());
        self.ready = None;
        self.pending = Some(Attempt {
            state,
            verifier,
            owner,
            created: Instant::now(),
        });
        Ok(url)
    }

    pub fn claim(&mut self, url: &Url) -> Option<(Attempt, Option<String>)> {
        let mut destination = url.clone();
        destination.set_query(None);
        if destination != self.callback || url.fragment().is_some() {
            return None;
        }
        let pairs: Vec<_> = url.query_pairs().collect();
        let state = pairs.iter().find(|(key, _)| key == "state")?.1.as_ref();
        if pairs.len() != 2
            || pairs.iter().filter(|(key, _)| key == "state").count() != 1
            || self.pending.as_ref()?.state != state
        {
            return None;
        }
        let code = pairs
            .iter()
            .find(|(key, value)| {
                key == "code"
                    && value.len() == 64
                    && value.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
            .map(|(_, value)| value.to_string());
        let cancelled = pairs
            .iter()
            .any(|(key, value)| key == "error" && value == "authentication_failed");
        if code.is_none() && !cancelled {
            return None;
        }
        let attempt = self.pending.take()?;
        let code = if attempt.created.elapsed() < Duration::from_secs(600) {
            code
        } else {
            None
        };
        Some((attempt, code))
    }

    pub fn owns(&self, state: &str) -> bool {
        self.active.as_deref() == Some(state)
    }

    pub fn accepts_session(&self, attempt: &Attempt, current: &[Cookie<'_>]) -> bool {
        self.owns(&attempt.state) && cookie_owner(current) == attempt.owner
    }

    pub fn exchange_body(&self, attempt: &Attempt, code: &str) -> serde_json::Value {
        serde_json::json!({ "code": code, "state": attempt.state,
            "codeVerifier": attempt.verifier, "redirectUri": self.callback.as_str() })
    }
}

fn benchmark_origin(origin: &Url) -> bool {
    cfg!(feature = "bench-loopback")
        && origin.scheme() == "http"
        && origin.host_str() == Some("127.0.0.1")
        && origin.port().is_some()
        && origin.username().is_empty()
        && origin.password().is_none()
        && origin.path() == "/"
        && origin.query().is_none()
        && origin.fragment().is_none()
}

#[cfg(test)]
mod benchmark_origin_tests {
    use super::AuthFlow;

    #[test]
    fn loopback_requires_the_explicit_benchmark_feature() {
        assert_eq!(
            AuthFlow::new("http://127.0.0.1:3400/".parse().unwrap(), "org.useorbit.desktop.staging").is_ok(),
            cfg!(feature = "bench-loopback")
        );
        for origin in ["http://localhost:3400/", "http://127.0.0.2:3400/", "https://127.0.0.1:3400/",
            "http://127.0.0.1:3400/login", "http://user@127.0.0.1:3400/", "http://127.0.0.1:3400/?x=1"] {
            assert!(AuthFlow::new(origin.parse().unwrap(), "org.useorbit.desktop.staging").is_err());
        }
    }
}

pub fn intercepts(origin: &Url, url: &Url) -> bool {
    url.origin() == origin.origin()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/api/auth/google/start"
        && url
            .query_pairs()
            .any(|(key, value)| key == "purpose" && value == "signin")
}

pub fn cookie_owner(cookies: &[Cookie<'_>]) -> CookieOwner {
    let mut owner: CookieOwner = cookies
        .iter()
        .filter(|cookie| matches!(cookie.name(), "auth_token" | "refresh_token"))
        .map(|cookie| (cookie.name().to_owned(), cookie.value().to_owned()))
        .collect();
    owner.sort();
    owner
}

pub fn session_cookies(
    headers: &[String],
    origin: &Url,
) -> Result<Vec<Cookie<'static>>, &'static str> {
    if headers.len() != 2 {
        return Err("Incomplete desktop session");
    }
    let mut cookies = Vec::new();
    for header in headers {
        let mut cookie = Cookie::parse(header.clone()).map_err(|_| "Invalid session cookie")?;
        if !matches!(cookie.name(), "auth_token" | "refresh_token")
            || cookie.value().is_empty()
            || cookie.http_only() != Some(true)
            || cookie.secure() != Some(true)
            || cookie.same_site() != Some(SameSite::Strict)
            || cookie.path() != Some("/")
            || cookie.domain().is_some()
            || cookie.max_age().is_none_or(|age| age.whole_seconds() <= 0)
            || cookies
                .iter()
                .any(|prior: &Cookie<'_>| prior.name() == cookie.name())
        {
            return Err("Invalid session cookie policy");
        }
        cookie.set_domain(
            origin
                .host_str()
                .ok_or("Invalid desktop origin")?
                .to_owned(),
        );
        cookies.push(cookie);
    }
    Ok(cookies)
}

pub fn install_session<Failure>(
    cookies: &[Cookie<'static>],
    previous: &[Cookie<'static>],
    mut set: impl FnMut(&Cookie<'static>) -> Result<(), Failure>,
    mut delete: impl FnMut(&Cookie<'static>) -> Result<(), Failure>,
) -> Result<(), &'static str> {
    for cookie in cookies {
        if set(cookie).is_err() {
            let mut restored = true;
            for installed in cookies {
                restored &= delete(installed).is_ok();
            }
            for prior in previous
                .iter()
                .filter(|prior| matches!(prior.name(), "auth_token" | "refresh_token"))
            {
                restored &= set(prior).is_ok();
            }
            return Err(if restored {
                "Cannot install desktop session"
            } else {
                "Cannot restore desktop session"
            });
        }
    }
    Ok(())
}

pub fn commit_session<Failure>(
    flow: &std::sync::Mutex<AuthFlow>,
    attempt: &Attempt,
    cookies: &[Cookie<'static>],
    read: impl FnOnce() -> Result<Vec<Cookie<'static>>, Failure>,
    set: impl FnMut(&Cookie<'static>) -> Result<(), Failure>,
    delete: impl FnMut(&Cookie<'static>) -> Result<(), Failure>,
) -> Result<bool, &'static str> {
    let guard = flow.lock().unwrap();
    let current = read().map_err(|_| "Cannot read desktop session")?;
    if !guard.accepts_session(attempt, &current) {
        return Ok(false);
    }
    install_session(cookies, &current, set, delete)?;
    drop(guard);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flow() -> AuthFlow {
        AuthFlow::new(
            "https://app-staging.useorbit.org/".parse().unwrap(),
            "org.useorbit.desktop.staging",
        )
        .unwrap()
    }

    fn callback(state: &str, result: &str) -> Url {
        format!("org.useorbit.desktop.staging://auth/callback?state={state}&{result}")
            .parse()
            .unwrap()
    }

    fn headers() -> Vec<String> {
        ["auth_token=header.payload.signature; Path=/; Expires=Tue, 19 Jan 2038 03:14:07 GMT; Max-Age=604800; Secure; HttpOnly; SameSite=strict",
         "refresh_token=ABCDEF0123456789; Path=/; Expires=Tue, 19 Jan 2038 03:14:07 GMT; Max-Age=31536000; Secure; HttpOnly; SameSite=strict"]
            .map(str::to_owned).to_vec()
    }

    #[test]
    fn only_the_matching_environment_can_own_a_flow() {
        for (identifier, origin) in [
            ("org.useorbit.desktop", "https://app.useorbit.org/"),
            (
                "org.useorbit.desktop.staging",
                "https://app-staging.useorbit.org/",
            ),
        ] {
            assert!(AuthFlow::new(origin.parse().unwrap(), identifier).is_ok());
            for invalid in [
                "http://app.useorbit.org/",
                "https://other.example/",
                "https://app.useorbit.org/path",
            ] {
                assert!(AuthFlow::new(invalid.parse().unwrap(), identifier).is_err());
            }
        }
        assert!(AuthFlow::new("https://app.useorbit.org/".parse().unwrap(), "unknown").is_err());
        assert!(AuthFlow::new(
            "https://app.useorbit.org/".parse().unwrap(),
            "org.useorbit.desktop.staging"
        )
        .is_err());
    }

    #[test]
    fn only_owned_google_signin_navigation_is_intercepted() {
        let flow = flow();
        assert!(intercepts(
            &flow.origin,
            &flow
                .origin
                .join("/api/auth/google/start?purpose=signin")
                .unwrap()
        ));
        for url in [
            "https://app.useorbit.org/api/auth/google/start?purpose=signin",
            "https://other.example/api/auth/google/start?purpose=signin",
            "https://app-staging.useorbit.org:444/api/auth/google/start?purpose=signin",
            "https://user@app-staging.useorbit.org/api/auth/google/start?purpose=signin",
            "https://app-staging.useorbit.org/api/auth/google/start?purpose=calendar",
            "https://app-staging.useorbit.org/api/auth/verify-code",
        ] {
            assert!(!intercepts(&flow.origin, &url.parse().unwrap()), "{url}");
        }
    }

    #[test]
    fn native_proof_stays_in_memory_and_matches_the_browser_challenge() {
        let mut flow = flow();
        let first = flow.begin(Vec::new()).unwrap();
        let pairs: std::collections::HashMap<_, _> = first.query_pairs().collect();
        let attempt = flow.pending.as_ref().unwrap();
        assert_eq!(pairs["desktopState"], attempt.state);
        assert_eq!(attempt.state.len(), 64);
        assert_eq!(attempt.verifier.len(), 43);
        assert_eq!(
            pairs["codeChallenge"],
            URL_SAFE_NO_PAD.encode(Sha256::digest(attempt.verifier.as_bytes()))
        );
        assert!(!first.as_str().contains(&attempt.verifier));
        assert_ne!(flow.begin(Vec::new()).unwrap(), first);
    }

    #[test]
    fn matching_callback_is_consumed_once_and_exchange_includes_native_verifier() {
        let mut flow = flow();
        flow.begin(Vec::new()).unwrap();
        let state = flow.pending.as_ref().unwrap().state.clone();
        let destination = callback(&state, &format!("code={}", "A".repeat(64)));
        let (attempt, code) = flow.claim(&destination).unwrap();
        let body = flow.exchange_body(&attempt, &code.unwrap());
        assert_eq!(body["state"], state);
        assert_eq!(body["codeVerifier"], attempt.verifier);
        assert_eq!(
            body["redirectUri"],
            "org.useorbit.desktop.staging://auth/callback"
        );
        assert!(flow.claim(&destination).is_none());
    }

    #[test]
    fn forged_or_malformed_callbacks_preserve_the_pending_attempt() {
        let mut flow = flow();
        flow.begin(Vec::new()).unwrap();
        let state = flow.pending.as_ref().unwrap().state.clone();
        let valid = callback(&state, &format!("code={}", "A".repeat(64)));
        for invalid in [
            valid.to_string().replace(".staging://", "://"),
            valid.to_string().replace("auth/callback", "other/callback"),
            valid
                .to_string()
                .replace("auth/callback", "auth:123/callback"),
            valid.to_string().replace(&state, "wrong"),
            format!("{valid}#fragment"),
            format!("{valid}&state={state}"),
            format!("{valid}&token=secret"),
            callback(&state, "code=invalid").to_string(),
        ] {
            assert!(flow.claim(&invalid.parse().unwrap()).is_none(), "{invalid}");
        }
        assert!(flow.claim(&valid).is_some());
    }

    #[test]
    fn stale_cancelled_expired_and_cold_callbacks_cannot_sign_in() {
        let mut flow = flow();
        assert!(flow
            .claim(&callback("cold", "error=authentication_failed"))
            .is_none());
        flow.begin(Vec::new()).unwrap();
        let stale = flow.pending.as_ref().unwrap().state.clone();
        flow.begin(Vec::new()).unwrap();
        assert!(!flow.owns(&stale));
        assert!(flow
            .claim(&callback(&stale, "error=authentication_failed"))
            .is_none());
        let current = flow.pending.as_ref().unwrap().state.clone();
        assert!(flow
            .claim(&callback(&current, "error=authentication_failed"))
            .unwrap()
            .1
            .is_none());
        flow.begin(Vec::new()).unwrap();
        let attempt = flow.pending.as_mut().unwrap();
        attempt.created = Instant::now() - Duration::from_secs(601);
        let state = attempt.state.clone();
        assert!(flow
            .claim(&callback(&state, &format!("code={}", "B".repeat(64))))
            .unwrap()
            .1
            .is_none());
    }

    #[test]
    fn bff_cookies_keep_their_security_expiry_and_environment_domain() {
        let origin = flow().origin;
        let cookies = session_cookies(&headers(), &origin).unwrap();
        for cookie in &cookies {
            assert_eq!(cookie.domain(), origin.host_str());
            assert_eq!(cookie.http_only(), Some(true));
            assert_eq!(cookie.secure(), Some(true));
            assert_eq!(cookie.same_site(), Some(SameSite::Strict));
            assert_eq!(cookie.path(), Some("/"));
            assert!(cookie.max_age().unwrap().whole_seconds() > 0);
            assert!(cookie.expires_datetime().is_some());
        }
        assert_eq!(cookie_owner(&cookies).len(), 2);
    }

    #[test]
    fn a_new_email_session_or_desktop_attempt_supersedes_a_claimed_callback() {
        let mut flow = flow();
        flow.begin(Vec::new()).unwrap();
        let state = flow.pending.as_ref().unwrap().state.clone();
        let (attempt, _) = flow
            .claim(&callback(&state, &format!("code={}", "A".repeat(64))))
            .unwrap();
        assert!(flow.accepts_session(&attempt, &[]));
        let signed_in = session_cookies(&headers(), &flow.origin).unwrap();
        assert!(!flow.accepts_session(&attempt, &signed_in));
        let cookies = signed_in.clone();
        let flow = std::sync::Mutex::new(flow);
        assert_eq!(
            commit_session(
                &flow,
                &attempt,
                &cookies,
                || Ok::<_, ()>(signed_in),
                |_| panic!("email session must not be overwritten"),
                |_| panic!("email session must not be deleted")
            ),
            Ok(false)
        );
        let mut flow = flow.into_inner().unwrap();
        flow.begin(Vec::new()).unwrap();
        assert!(!flow.accepts_session(&attempt, &[]));
        assert_eq!(
            commit_session(
                &std::sync::Mutex::new(flow),
                &attempt,
                &cookies,
                || Ok::<_, ()>(Vec::new()),
                |_| panic!("stale attempt must not write"),
                |_| panic!("stale attempt must not delete")
            ),
            Ok(false)
        );
    }

    #[test]
    fn superseding_during_cookie_commit_keeps_the_newer_session_intact() {
        use std::sync::{mpsc, Arc, Mutex, TryLockError};
        let mut auth = flow();
        auth.begin(Vec::new()).unwrap();
        let state = auth.pending.as_ref().unwrap().state.clone();
        let (attempt, _) = auth
            .claim(&callback(&state, &format!("code={}", "A".repeat(64))))
            .unwrap();
        let cookies = session_cookies(&headers(), &auth.origin).unwrap();
        let flow = Arc::new(Mutex::new(auth));
        let stored = Arc::new(Mutex::new(Vec::<Cookie<'static>>::new()));
        let (checked, pause) = mpsc::channel();
        let (resume, resumed) = mpsc::channel();
        let writing_flow = flow.clone();
        let writing_store = stored.clone();
        let writer = std::thread::spawn(move || {
            let mut first = true;
            commit_session(
                &writing_flow,
                &attempt,
                &cookies,
                || Ok::<_, ()>(writing_store.lock().unwrap().clone()),
                |cookie| {
                    if first {
                        first = false;
                        checked.send(()).unwrap();
                        resumed.recv().unwrap();
                    }
                    let mut stored = writing_store.lock().unwrap();
                    stored.retain(|prior| prior.name() != cookie.name());
                    stored.push(cookie.clone());
                    Ok(())
                },
                |_| Ok(()),
            )
            .unwrap()
        });
        pause.recv().unwrap();
        let (superseding, superseded) = mpsc::channel();
        let newer_store = stored.clone();
        let newer = std::thread::spawn(move || {
            let mut guard = match flow.try_lock() {
                Ok(guard) => guard,
                Err(TryLockError::WouldBlock) => {
                    superseding.send(()).unwrap();
                    flow.lock().unwrap()
                }
                Err(error) => panic!("{error}"),
            };
            guard.begin(Vec::new()).unwrap();
            *newer_store.lock().unwrap() = vec![
                Cookie::new("auth_token", "new-access"),
                Cookie::new("refresh_token", "new-refresh"),
            ];
            let _ = superseding.send(());
        });
        superseded.recv().unwrap();
        resume.send(()).unwrap();
        assert!(writer.join().unwrap());
        newer.join().unwrap();
        assert_eq!(
            cookie_owner(&stored.lock().unwrap()),
            vec![
                ("auth_token".into(), "new-access".into()),
                ("refresh_token".into(), "new-refresh".into())
            ]
        );
    }

    #[test]
    fn incomplete_or_weakened_session_cookies_are_rejected_before_installation() {
        let origin = flow().origin;
        assert!(session_cookies(&headers()[..1], &origin).is_err());
        assert!(session_cookies(&[headers()[0].clone(), headers()[0].clone()], &origin).is_err());
        for (old, new) in [
            ("; HttpOnly", ""),
            ("; Secure", ""),
            ("SameSite=strict", "SameSite=lax"),
            ("Path=/;", "Path=/login;"),
            ("Max-Age=604800", "Max-Age=0"),
            ("auth_token=", "unexpected="),
            ("; Secure", "; Domain=other.example; Secure"),
        ] {
            let mut invalid = headers();
            invalid[0] = invalid[0].replace(old, new);
            assert!(session_cookies(&invalid, &origin).is_err(), "{old}");
        }
    }

    #[test]
    fn failed_cookie_installation_restores_the_previous_session() {
        use std::{cell::RefCell, collections::BTreeMap};
        let origin = flow().origin;
        let cookies = session_cookies(&headers(), &origin).unwrap();
        let previous = vec![Cookie::new("refresh_token", "previous-refresh")];
        let stored = RefCell::new(BTreeMap::from([(
            "refresh_token".to_owned(),
            "previous-refresh".to_owned(),
        )]));
        let result = install_session(
            &cookies,
            &previous,
            |cookie| {
                if cookie.name() == "refresh_token" && cookie.value() != "previous-refresh" {
                    return Err(());
                }
                stored
                    .borrow_mut()
                    .insert(cookie.name().to_owned(), cookie.value().to_owned());
                Ok(())
            },
            |cookie| {
                stored.borrow_mut().remove(cookie.name());
                Ok(())
            },
        );
        assert_eq!(result, Err("Cannot install desktop session"));
        assert_eq!(
            stored.into_inner(),
            BTreeMap::from([("refresh_token".to_owned(), "previous-refresh".to_owned())])
        );
        assert_eq!(
            install_session(&cookies, &[], |_| Err(()), |_| Err(())),
            Err("Cannot restore desktop session")
        );
        let mut installed = Vec::new();
        assert!(install_session(
            &cookies,
            &[],
            |cookie| {
                installed.push(cookie.name().to_owned());
                Ok::<_, ()>(())
            },
            |_| panic!("successful installation needs no rollback")
        )
        .is_ok());
        assert_eq!(installed, vec!["auth_token", "refresh_token"]);
    }
}
