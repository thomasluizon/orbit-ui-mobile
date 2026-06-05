import { forwardRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Image as ImageIcon,
  Mic,
  Square,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES } from "@orbit/shared/chat";
import { ChatComposerInput } from "@/components/chat/chat-composer-input";
import { RecordingVisualizer } from "@/components/chat/chat-animations";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

interface ChatInputBarProps {
  tokens: Tokens;
  styles: ChatStyles;
  isRecording: boolean;
  isTyping: boolean;
  isOnline: boolean;
  atMessageLimit: boolean;
  selectedImagePresent: boolean;
  transcript: string;
  composerResetSignal: number;
  recordingTime: string;
  speechSupported: boolean;
  speechLang: string;
  currentLangFlag: string;
  showLangPicker: boolean;
  onSend: (message: string) => void;
  onToggleRecording: () => void;
  onOpenFilePicker: () => void;
  onToggleLangPicker: () => void;
  onSelectLanguage: (value: string) => void;
}

export const ChatInputBar = forwardRef<View, Readonly<ChatInputBarProps>>(
  function ChatInputBar(
    {
      tokens,
      styles,
      isRecording,
      isTyping,
      isOnline,
      atMessageLimit,
      selectedImagePresent,
      transcript,
      composerResetSignal,
      recordingTime,
      speechSupported,
      speechLang,
      currentLangFlag,
      showLangPicker,
      onSend,
      onToggleRecording,
      onOpenFilePicker,
      onToggleLangPicker,
      onSelectLanguage,
    },
    voiceRef,
  ) {
    const { t } = useTranslation();

    return (
      <View style={[styles.inputBar, { borderTopColor: tokens.hairline }]}>
        {isRecording ? (
          <>
            <View style={styles.recordingContent}>
              <View style={styles.recordingStatus}>
                <View
                  style={[
                    styles.recordingDot,
                    { backgroundColor: tokens.statusBad },
                  ]}
                />
                <Text style={[styles.recordingTime, { color: tokens.fg1 }]}>
                  {recordingTime}
                </Text>
              </View>
              <RecordingVisualizer styles={styles} />
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("chat.stopRecording")}
              activeOpacity={0.7}
              onPress={onToggleRecording}
              style={[styles.stopButton, { backgroundColor: tokens.fg1 }]}
            >
              <Square size={11} color={tokens.bg} fill={tokens.bg} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ChatComposerInput
              transcript={transcript}
              resetSignal={composerResetSignal}
              isRecording={isRecording}
              isTyping={isTyping}
              atMessageLimit={atMessageLimit}
              isOnline={isOnline}
              selectedImagePresent={selectedImagePresent}
              placeholder={t("chat.placeholder")}
              tokens={tokens}
              styles={styles}
              onSend={onSend}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("chat.attachImage")}
              activeOpacity={0.7}
              disabled={!isOnline}
              onPress={onOpenFilePicker}
              style={styles.iconButton}
            >
              <ImageIcon size={17} color={tokens.fg3} strokeWidth={1.5} />
            </TouchableOpacity>

            {speechSupported && (
              <View ref={voiceRef} style={styles.languageControl}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.toggleMic")}
                  activeOpacity={0.7}
                  disabled={isTyping || !isOnline}
                  onPress={onToggleRecording}
                  style={styles.iconButton}
                >
                  <Mic size={17} color={tokens.fg3} strokeWidth={1.5} />
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.speechLanguage")}
                  activeOpacity={0.7}
                  disabled={!isOnline}
                  onPress={onToggleLangPicker}
                  style={styles.languageFlagButton}
                >
                  <Text style={styles.languageFlagText}>{currentLangFlag}</Text>
                </TouchableOpacity>

                {showLangPicker && (
                  <View
                    style={[
                      styles.languagePicker,
                      {
                        backgroundColor: tokens.bgElev,
                        borderColor: tokens.hairlineStrong,
                      },
                    ]}
                  >
                    {SPEECH_LANGUAGES.map((lang) => (
                      <TouchableOpacity
                        key={lang.value}
                        activeOpacity={0.7}
                        onPress={() => onSelectLanguage(lang.value)}
                        style={[
                          styles.languageOption,
                          speechLang === lang.value && {
                            backgroundColor: tokens.bgSunk,
                          },
                        ]}
                      >
                        <Text style={styles.languageOptionFlag}>{lang.flag}</Text>
                        <Text
                          style={[
                            styles.languageOptionText,
                            { color: tokens.fg2 },
                            speechLang === lang.value && {
                              color: tokens.fg1,
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {lang.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    );
  },
);
