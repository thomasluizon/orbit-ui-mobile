use tauri_plugin_updater::{Config, RemoteRelease};

const RELEASES: &str = "https://github.com/thomasluizon/orbit-ui-mobile/releases/download";
pub const TARGETS: [&str; 4] = [
    "darwin-aarch64",
    "darwin-x86_64",
    "windows-x86_64",
    "windows-aarch64",
];

pub fn channel(identifier: &str) -> Result<&'static str, &'static str> {
    match identifier {
        "org.useorbit.desktop" => Ok("production"),
        "org.useorbit.desktop.staging" => Ok("staging"),
        #[cfg(feature = "bench-loopback")]
        "org.useorbit.desktop.benchmark" => Ok("staging"),
        _ => Err("Unknown desktop update channel"),
    }
}

pub fn validate_config(channel: &str, config: &Config) -> Result<(), &'static str> {
    let endpoint = format!("{RELEASES}/desktop-{channel}/latest.json");
    if config.endpoints.len() != 1 || config.endpoints[0].as_str() != endpoint {
        return Err("Desktop update endpoint does not match its channel");
    }
    if !config.require_signed_version
        || config.allow_downgrades
        || config.dangerous_insecure_transport_protocol
        || config.dangerous_accept_invalid_certs
        || config.dangerous_accept_invalid_hostnames
    {
        return Err("Desktop updates require TLS and signed newer versions");
    }
    Ok(())
}

pub fn validate_manifest(channel: &str, manifest: serde_json::Value) -> Result<(), String> {
    let release: RemoteRelease =
        serde_json::from_value(manifest).map_err(|error| error.to_string())?;
    let prefix = format!("{RELEASES}/desktop-{channel}-v{}/", release.version);
    for target in TARGETS {
        let url = release
            .download_url(target)
            .map_err(|error| error.to_string())?;
        if !url.as_str().starts_with(&prefix) || url.query().is_some() || url.fragment().is_some() {
            return Err("Desktop update artifact does not match its channel and version".into());
        }
        if release
            .signature(target)
            .map_err(|error| error.to_string())?
            .trim()
            .is_empty()
        {
            return Err("Desktop update signature is missing".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn benchmark_identifier_requires_the_loopback_feature() {
        assert_eq!(
            channel("org.useorbit.desktop.benchmark").is_ok(),
            cfg!(feature = "bench-loopback")
        );
    }

    fn config(production: bool) -> Config {
        let source = if production {
            include_str!("../tauri.production.conf.json")
        } else {
            include_str!("../tauri.conf.json")
        };
        let config: serde_json::Value = serde_json::from_str(source).unwrap();
        serde_json::from_value(config["plugins"]["updater"].clone()).unwrap()
    }

    #[test]
    fn both_identifiers_select_only_their_own_channel() {
        for (identifier, expected, production) in [
            ("org.useorbit.desktop", "production", true),
            ("org.useorbit.desktop.staging", "staging", false),
        ] {
            assert_eq!(channel(identifier), Ok(expected));
            assert!(validate_config(expected, &config(production)).is_ok());
            assert!(validate_config(expected, &config(!production)).is_err());
        }
        assert!(channel("org.useorbit.desktop.other").is_err());
    }

    #[test]
    fn insecure_or_downgrade_configuration_is_rejected() {
        let mut candidate = config(false);
        candidate.require_signed_version = false;
        assert!(validate_config("staging", &candidate).is_err());
        candidate = config(false);
        candidate.allow_downgrades = true;
        assert!(validate_config("staging", &candidate).is_err());
    }

    #[test]
    fn every_tls_bypass_and_additional_endpoint_is_rejected() {
        let bypasses: [fn(&mut Config); 3] = [
            |candidate| candidate.dangerous_insecure_transport_protocol = true,
            |candidate| candidate.dangerous_accept_invalid_certs = true,
            |candidate| candidate.dangerous_accept_invalid_hostnames = true,
        ];
        for enable_bypass in bypasses {
            let mut candidate = config(false);
            enable_bypass(&mut candidate);
            assert!(validate_config("staging", &candidate).is_err());
        }
        for endpoints in [
            vec![],
            vec!["http://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json"],
            vec!["https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json?redirect=other"],
            vec!["https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json", "https://attacker.example/latest.json"],
        ] {
            let mut candidate = config(false);
            candidate.endpoints = endpoints.iter().map(|url| url.parse().unwrap()).collect();
            assert!(validate_config("staging", &candidate).is_err());
        }
    }

    #[test]
    fn artifact_queries_fragments_and_blank_signatures_are_rejected_on_every_target() {
        for target in TARGETS {
            for suffix in ["?download=1", "#package"] {
                let mut candidate = manifest(false);
                let original = candidate["platforms"][target]["url"].as_str().unwrap();
                candidate["platforms"][target]["url"] =
                    serde_json::json!(format!("{original}{suffix}"));
                assert!(
                    validate_manifest("staging", candidate).is_err(),
                    "{target}{suffix}"
                );
            }
            let mut candidate = manifest(false);
            candidate["platforms"][target]["signature"] = serde_json::json!(" \n\t");
            assert!(validate_manifest("staging", candidate).is_err(), "{target}");
        }
    }

    fn manifest(production: bool) -> serde_json::Value {
        serde_json::from_str(if production {
            include_str!("../../__fixtures__/latest-production.json")
        } else {
            include_str!("../../__fixtures__/latest-staging.json")
        })
        .unwrap()
    }

    #[test]
    fn publisher_manifests_are_parsed_by_the_pinned_plugin_for_all_four_targets() {
        for (channel, production) in [("staging", false), ("production", true)] {
            assert!(validate_manifest(channel, manifest(production)).is_ok());
            assert!(validate_manifest(channel, manifest(!production)).is_err());
        }
    }

    #[test]
    fn malformed_incomplete_and_cross_channel_manifests_are_rejected() {
        for invalid in ["version", "platforms"] {
            let mut candidate = manifest(false);
            candidate.as_object_mut().unwrap().remove(invalid);
            assert!(validate_manifest("staging", candidate).is_err());
        }
        for target in TARGETS {
            let mut candidate = manifest(false);
            candidate["platforms"]
                .as_object_mut()
                .unwrap()
                .remove(target);
            assert!(validate_manifest("staging", candidate).is_err());
            for (field, value) in [
                ("signature", ""),
                ("url", "http://github.com/untrusted"),
                ("url", "https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-production-v2.0.0/package"),
                ("url", "https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging-v1.0.0/package"),
            ] {
                let mut candidate = manifest(false);
                candidate["platforms"][target][field] = serde_json::json!(value);
                assert!(validate_manifest("staging", candidate).is_err());
            }
        }
        let mut candidate = manifest(false);
        candidate["version"] = serde_json::json!("invalid");
        assert!(validate_manifest("staging", candidate).is_err());
    }
}
