import { forwardRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Image as ImageIcon,
  Lock,
  Mic,
  Square,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ChatComposerInput } from "@/components/chat/chat-composer-input";
import { RecordingVisualizer } from "@/components/chat/chat-animations";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

interface ChatInputBarProps {
  tokens: Tokens;
  styles: ChatStyles;
  isRecording: boolean;
  isTranscribing: boolean;
  isTyping: boolean;
  isOnline: boolean;
  atMessageLimit: boolean;
  limitLocked: boolean;
  selectedImagePresent: boolean;
  transcript: string;
  composerResetSignal: number;
  recordingTime: string;
  speechSupported: boolean;
  onSend: (message: string) => void;
  onToggleRecording: () => void;
  onOpenFilePicker: () => void;
}

export const ChatInputBar = forwardRef<View, Readonly<ChatInputBarProps>>(
  function ChatInputBar(
    {
      tokens,
      styles,
      isRecording,
      isTranscribing,
      isTyping,
      isOnline,
      atMessageLimit,
      limitLocked,
      selectedImagePresent,
      transcript,
      composerResetSignal,
      recordingTime,
      speechSupported,
      onSend,
      onToggleRecording,
      onOpenFilePicker,
    },
    voiceRef,
  ) {
    const { t } = useTranslation();

    return (
      <View style={styles.inputBar}>
        {isRecording || isTranscribing ? (
          <>
            <View style={styles.recordingContent}>
              {isTranscribing ? (
                <Text
                  style={[styles.recordingTime, { color: tokens.fg2 }]}
                  accessibilityLiveRegion="polite"
                >
                  {t("chat.transcribing")}
                </Text>
              ) : (
                <>
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
                </>
              )}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("chat.stopRecording")}
              accessibilityState={{ disabled: isTranscribing }}
              disabled={isTranscribing}
              activeOpacity={0.7}
              onPress={onToggleRecording}
              style={[styles.stopButton, isTranscribing && { opacity: 0.5 }]}
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
                  <View ref={voiceRef} collapsable={false}>
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
