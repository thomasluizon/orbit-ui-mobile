use std::collections::HashMap;

pub struct Labels(HashMap<String, String>);

impl Labels {
    pub fn new(locale: &str) -> Self {
        let catalog = if locale.eq_ignore_ascii_case("pt")
            || locale.to_ascii_lowercase().starts_with("pt-")
        {
            include_str!("../../locales/pt-BR.json")
        } else {
            include_str!("../../locales/en.json")
        };
        Self(serde_json::from_str(catalog).expect("desktop menu catalog must be valid"))
    }

    pub fn text<'a>(&'a self, key: &'a str) -> &'a str {
        self.0.get(key).map(String::as_str).unwrap_or(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_literal_label_in_rust_exists_in_english() {
        let english = Labels::new("en");
        for entry in std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/src")).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_none_or(|extension| extension != "rs") {
                continue;
            }
            let source = std::fs::read_to_string(&path).unwrap();
            let production = source.split("#[cfg(test)]").next().unwrap();
            for usage in production.split("labels.text(\"").skip(1) {
                let key = usage.split('"').next().unwrap();
                assert!(
                    english.0.contains_key(key),
                    "missing label {key} in {}",
                    path.display()
                );
            }
        }
    }

    #[test]
    fn missing_label_returns_its_key() {
        assert_eq!(Labels::new("en").text("unknown-label"), "unknown-label");
    }

    #[test]
    fn menus_follow_the_system_language_with_english_for_other_locales() {
        for locale in ["pt-BR", "pt-PT", "pt", "PT-br"] {
            assert_eq!(Labels::new(locale).text("open"), "Abrir Orbit");
            assert_eq!(Labels::new(locale).text("reminderDone"), "Concluir");
        }
        for locale in ["en-US", "en", "fr-FR", "", "ptx"] {
            assert_eq!(Labels::new(locale).text("open"), "Open Orbit");
            assert_eq!(Labels::new(locale).text("reminderDone"), "Done");
        }
    }

    #[test]
    fn both_catalogs_have_the_same_nonempty_labels() {
        let english = Labels::new("en");
        let portuguese = Labels::new("pt-BR");
        assert_eq!(english.0.len(), portuguese.0.len());
        for key in english.0.keys() {
            assert!(!english.text(key).trim().is_empty());
            assert!(!portuguese.text(key).trim().is_empty());
        }
    }
}
