import { forwardRef, useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Image as ImageIcon,
  Lock,
  Mic,
  Paperclip,
  Square,
} from '@/components/ui/icons';
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHAT_DRAFT_STORAGE_KEY } from "@orbit/shared/hooks";
import { ChatComposerInput } from "@/components/chat/chat-composer-input";
import { RecordingPulseDot, RecordingVisualizer } from "@/components/chat/chat-animations";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

const FIELD_ICON_HIT_SLOP = { top: 5, bottom: 5, left: 5, right: 5 };

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
  selectedTextFilePresent: boolean;
  transcript: string;
  composerResetSignal: number;
  recordingTime: string;
  speechSupported: boolean;
  onSend: (message: string) => void;
  onToggleRecording: () => void;
  onOpenFilePicker: () => void;
  onOpenTextFilePicker: () => void;
}

/**
 * Renders the chat composer row, swapping between the text input and the
 * recording/transcribing UI. Owns the draft text (rather than the inner
 * `ChatComposerInput`) because that input unmounts while recording: keeping the
 * draft and the voice-transcript commit here lets a finished transcript land in
 * the input once recording stops.
 */
// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational composer aggregator: each boolean is an independent chat-input UI-state flag (recording/transcribing/typing) owned by the chat screen; an options-object rewrite would churn the caller for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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
      selectedTextFilePresent,
      transcript,
      composerResetSignal,
      recordingTime,
      speechSupported,
      onSend,
      onToggleRecording,
      onOpenFilePicker,
      onOpenTextFilePicker,
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
      (draft.trim().length > 0 || selectedImagePresent || selectedTextFilePresent) &&
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
                <View style={styles.recordingStatus}>
                  <View
                    style={[
                      styles.recordingDot,
                      { backgroundColor: tokens.primary },
                    ]}
                  />
                  <Text
                    style={[styles.recordingTime, { color: tokens.fg2 }]}
                    accessibilityLiveRegion="polite"
                  >
                    {t("chat.transcribing")}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.recordingStatus}>
                    <RecordingPulseDot
                      style={styles.recordingDot}
                      color={tokens.statusBad}
                    />
                    <Text style={[styles.recordingTime, { color: tokens.fg1 }]}>
                      {recordingTime}
                    </Text>
                  </View>
                  <RecordingVisualizer styles={styles} />
                </>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("chat.stopRecording")}
              accessibilityState={{ disabled: isTranscribing }}
              disabled={isTranscribing}
              onPress={onToggleRecording}
              style={({ pressed }) => [
                styles.stopButton,
                isTranscribing && { opacity: 0.5 },
                pressed && !isTranscribing && styles.iconPressed,
              ]}
            >
              <Square size={18} color={tokens.statusBad} fill={tokens.statusBad} />
            </Pressable>
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.attachFile")}
                  disabled={!isOnline}
                  hitSlop={FIELD_ICON_HIT_SLOP}
                  onPress={onOpenTextFilePicker}
                  style={({ pressed }) => [
                    styles.fieldIconButton,
                    pressed && styles.iconPressed,
                  ]}
                >
                  <Paperclip size={18} color={tokens.fg3} strokeWidth={1.8} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.attachImage")}
                  disabled={!isOnline}
                  hitSlop={FIELD_ICON_HIT_SLOP}
                  onPress={onOpenFilePicker}
                  style={({ pressed }) => [
                    styles.fieldIconButton,
                    pressed && styles.iconPressed,
                  ]}
                >
                  <ImageIcon size={18} color={tokens.fg3} strokeWidth={1.8} />
                </Pressable>

                {speechSupported && (
                  <View ref={voiceRef} collapsable={false}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("chat.toggleMic")}
                      disabled={isTyping || !isOnline}
                      hitSlop={FIELD_ICON_HIT_SLOP}
                      onPress={onToggleRecording}
                      style={({ pressed }) => [
                        styles.fieldIconButton,
                        pressed && styles.iconPressed,
                      ]}
                    >
                      <Mic size={18} color={tokens.fg3} strokeWidth={1.8} />
                    </Pressable>
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
