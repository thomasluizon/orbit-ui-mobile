import { forwardRef, useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Image as ImageIcon,
  Lock,
  Mic,
  Square,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHAT_DRAFT_STORAGE_KEY } from "@orbit/shared/hooks";
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

/**
 * Renders the chat composer row, swapping between the text input and the
 * recording/transcribing UI. Owns the draft text (rather than the inner
 * `ChatComposerInput`) because that input unmounts while recording: keeping the
 * draft and the voice-transcript commit here lets a finished transcript land in
 * the input once recording stops.
 */
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

    const [draft, setDraft] = useState("");
    const [prevIsRecording, setPrevIsRecording] = useState(false);
    const [pendingVoiceCommit, setPendingVoiceCommit] = useState(false);
    const [prevResetSignal, setPrevResetSignal] = useState(composerResetSignal);

    useEffect(() => {
      let isMounted = true;

      void AsyncStorage.getItem(CHAT_DRAFT_STORAGE_KEY)
        .then((storedDraft) => {
          if (!isMounted || !storedDraft) return;
          setDraft(storedDraft);
        })
        .catch(() => {});

      return () => {
        isMounted = false;
      };
    }, []);

    if (isRecording !== prevIsRecording) {
      setPrevIsRecording(isRecording);
      if (isRecording) setPendingVoiceCommit(true);
    }

    if (pendingVoiceCommit && !isRecording && transcript.trim()) {
      setPendingVoiceCommit(false);
      setDraft((current) =>
        current ? `${current} ${transcript.trim()}` : transcript.trim(),
      );
    }

    if (composerResetSignal !== prevResetSignal) {
      setPrevResetSignal(composerResetSignal);
      setDraft("");
    }

    useEffect(() => {
      void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    }, [composerResetSignal]);

    useEffect(() => {
      if (!draft.trim()) {
        void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
        return;
      }

      void AsyncStorage.setItem(CHAT_DRAFT_STORAGE_KEY, draft);
    }, [draft]);

    const canSend =
      (draft.trim().length > 0 || selectedImagePresent) &&
      !isTyping &&
      !atMessageLimit &&
      !isRecording;

    const handleSend = useCallback(() => {
      const message = draft.trim();
      if (!canSend || !isOnline) return;

      onSend(message);
      setDraft("");
    }, [canSend, draft, isOnline, onSend]);

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
            draft={draft}
            canSend={canSend}
            isOnline={isOnline}
            limitLocked={limitLocked}
            placeholder={limitLocked ? t("chat.limitReachedError") : t("chat.placeholder")}
            tokens={tokens}
            styles={styles}
            onChangeDraft={setDraft}
            onSubmit={handleSend}
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
