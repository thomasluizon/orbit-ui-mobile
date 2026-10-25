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

    pub fn text(&self, key: &str) -> &str {
        &self.0[key]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menus_follow_the_system_language_with_english_for_other_locales() {
        for locale in ["pt-BR", "pt-PT", "pt", "PT-br"] {
            assert_eq!(Labels::new(locale).text("open"), "Abrir Orbit");
        }
        for locale in ["en-US", "en", "fr-FR", "", "ptx"] {
            assert_eq!(Labels::new(locale).text("open"), "Open Orbit");
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
