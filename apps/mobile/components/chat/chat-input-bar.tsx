import { forwardRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Image as ImageIcon,
  Lock,
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
  limitLocked: boolean;
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
      limitLocked,
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
      <View style={styles.inputBar}>
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
              style={styles.stopButton}
            >
              <Square size={18} color={tokens.statusBad} fill={tokens.statusBad} />
            </TouchableOpacity>
          </>
        ) : (
          <ChatComposerInput
            transcript={transcript}
            resetSignal={composerResetSignal}
            isRecording={isRecording}
            isTyping={isTyping}
            atMessageLimit={atMessageLimit}
            limitLocked={limitLocked}
            isOnline={isOnline}
            selectedImagePresent={selectedImagePresent}
            placeholder={limitLocked ? t("chat.limitReachedError") : t("chat.placeholder")}
            tokens={tokens}
            styles={styles}
            onSend={onSend}
            fieldAccessories={
              limitLocked ? (
                <View style={styles.fieldIconButton}>
                  <Lock size={18} color={tokens.fg4} strokeWidth={1.8} />
                </View>
              ) : (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.attachImage")}
                  activeOpacity={0.7}
                  disabled={!isOnline}
                  onPress={onOpenFilePicker}
                  style={styles.fieldIconButton}
                >
                  <ImageIcon size={18} color={tokens.fg3} strokeWidth={1.8} />
                </TouchableOpacity>

                {speechSupported && (
                  <View ref={voiceRef} style={styles.languageControl}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.toggleMic")}
                      activeOpacity={0.7}
                      disabled={isTyping || !isOnline}
                      onPress={onToggleRecording}
                      style={styles.fieldIconButton}
                    >
                      <Mic size={18} color={tokens.fg3} strokeWidth={1.8} />
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
                      <View style={styles.languagePicker}>
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
                )}
              </>
              )
            }
          />
        )}
      </View>
    );
  },
);
