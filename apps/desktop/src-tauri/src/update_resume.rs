use std::{fs, io::Write, path::Path};
use tauri::{AppHandle, Manager, Url};

fn resume_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("update-resume.json"))
}

pub fn save(app: &AppHandle, url: &Url) -> Result<(), String> {
    let path = resume_path(app)?;
    let directory = path.parent().ok_or("Missing desktop resume directory")?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
    file.write_all(resume_url(url).as_str().as_bytes())
        .map_err(|error| error.to_string())?;
    file.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    Ok(())
}

fn resume_url(url: &Url) -> Url {
    let mut destination = url.clone();
    destination.set_query(None);
    destination.set_fragment(None);
    destination
}

pub fn clear(app: &AppHandle) -> Result<(), String> {
    remove(&resume_path(app)?)
}

fn remove(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn take(app: &AppHandle, origin: &Url) -> Result<Option<Url>, String> {
    read(&resume_path(app)?, origin)
}

fn read(path: &Path, origin: &Url) -> Result<Option<Url>, String> {
    let stored = match fs::read_to_string(path) {
        Ok(stored) => stored,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    remove(path)?;
    let url = Url::parse(&stored).map_err(|error| error.to_string())?;
    if url.origin() != origin.origin() || !url.username().is_empty() || url.password().is_some() {
        return Err("Invalid desktop update resume origin".into());
    }
    Ok(Some(resume_url(&url)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_resume_route_drops_query_and_fragment() {
        for path in ["/calendar", "/auth-callback/x", "/onboarding/step"] {
            let url = Url::parse(&format!(
                "https://app.useorbit.org{path}?code=x&token=y#frag"
            ))
            .unwrap();
            assert_eq!(
                resume_url(&url).as_str(),
                format!("https://app.useorbit.org{path}")
            );
        }
    }

    #[test]
    fn restart_restores_the_same_environment_route_once() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("resume");
        let origin = Url::parse("https://app.useorbit.org/").unwrap();
        let destination = "https://app.useorbit.org/calendar?month=10#day";
        fs::write(&path, destination).unwrap();
        assert_eq!(
            read(&path, &origin).unwrap().unwrap().as_str(),
            "https://app.useorbit.org/calendar"
        );
        assert!(read(&path, &origin).unwrap().is_none());
    }

    #[test]
    fn authentication_resume_never_persists_one_time_credentials() {
        let url =
            Url::parse("https://app.useorbit.org/login?code=one-time&email=person#proof").unwrap();
        assert_eq!(resume_url(&url).as_str(), "https://app.useorbit.org/login");
    }

    #[test]
    fn restart_rejects_foreign_local_and_credentialed_destinations() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("resume");
        let origin = Url::parse("https://app.useorbit.org/").unwrap();
        for destination in [
            "https://app-staging.useorbit.org/",
            "file:///private",
            "https://user@app.useorbit.org/",
            "invalid",
        ] {
            fs::write(&path, destination).unwrap();
            assert!(read(&path, &origin).is_err());
            assert!(!path.exists());
        }
    }
}
