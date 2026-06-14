import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES } from "@orbit/shared/chat";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

interface ChatLanguagePickerProps {
  tokens: Tokens;
  styles: ChatStyles;
  speechLang: string;
  currentLangFlag: string;
  showLangPicker: boolean;
  onToggleLangPicker: () => void;
  onSelectLanguage: (value: string) => void;
}

/** Header voice-language control: a flag button that opens the speech-recognition
 *  language list. Rendered in the chat AppBar trailing slot when speech is supported. */
export function ChatLanguagePicker({
  tokens,
  styles,
  speechLang,
  currentLangFlag,
  showLangPicker,
  onToggleLangPicker,
  onSelectLanguage,
}: Readonly<ChatLanguagePickerProps>) {
  const { t } = useTranslation();

  return (
    <View style={styles.languageControl}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t("chat.speechLanguage")}
        activeOpacity={0.7}
        onPress={onToggleLangPicker}
        style={styles.iconBtn}
      >
        <Text style={styles.languageFlagText}>{currentLangFlag}</Text>
      </TouchableOpacity>

      {showLangPicker && (
        <View style={styles.languagePickerHeader}>
          {SPEECH_LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.value}
              activeOpacity={0.7}
              onPress={() => onSelectLanguage(lang.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: speechLang === lang.value }}
              style={[
                styles.languageOption,
                speechLang === lang.value && {
                  backgroundColor: tokens.bgElev,
                },
              ]}
            >
              <Text style={styles.languageOptionFlag}>{lang.flag}</Text>
              <Text
                style={[
                  styles.languageOptionText,
                  { color: tokens.fg2 },
                  speechLang === lang.value && [
                    styles.languageOptionTextSelected,
                    { color: tokens.fg1 },
                  ],
                ]}
              >
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
