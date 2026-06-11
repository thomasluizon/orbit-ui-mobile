import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { TouchableOpacity, View } from "react-native";
import { ArrowUp } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHAT_DRAFT_STORAGE_KEY } from "@orbit/shared/hooks";
import { AppTextInput } from "@/components/ui/app-text-input";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

interface ChatComposerInputProps {
  transcript: string;
  resetSignal: number;
  isRecording: boolean;
  isTyping: boolean;
  atMessageLimit: boolean;
  isOnline: boolean;
  selectedImagePresent: boolean;
  placeholder: string;
  tokens: Tokens;
  styles: ChatStyles;
  fieldAccessories?: ReactNode;
  onSend: (message: string) => void;
}

export const ChatComposerInput = memo(function ChatComposerInput({
  transcript,
  resetSignal,
  isRecording,
  isTyping,
  atMessageLimit,
  isOnline,
  selectedImagePresent,
  placeholder,
  tokens,
  styles,
  fieldAccessories,
  onSend,
}: Readonly<ChatComposerInputProps>) {
  const [draft, setDraft] = useState("");
  const prevIsRecording = useRef(false);

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

  useEffect(() => {
    if (prevIsRecording.current && !isRecording && transcript.trim()) {
      setDraft((current) =>
        current ? `${current} ${transcript.trim()}` : transcript.trim(),
      );
    }
    prevIsRecording.current = isRecording;
  }, [isRecording, transcript]);

  useEffect(() => {
    setDraft("");
    void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
  }, [resetSignal]);

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
    if (!canSend || !isOnline) {
      return;
    }

    onSend(message);
    setDraft("");
  }, [canSend, draft, isOnline, onSend]);

  return (
    <>
      <View style={styles.composerField}>
        <AppTextInput
          style={[styles.textInput, { color: tokens.fg1 }]}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={tokens.fg3}
          multiline
          maxLength={2000}
          editable={isOnline}
          returnKeyType="default"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />
        {fieldAccessories}
      </View>

      <TouchableOpacity
        style={[
          styles.sendButton,
          canSend && isOnline ? styles.sendButtonGlow : styles.sendButtonDisabled,
        ]}
        onPress={handleSend}
        disabled={!canSend || !isOnline}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend || !isOnline }}
        activeOpacity={0.7}
      >
        <ArrowUp size={22} color={tokens.fgOnPrimary} strokeWidth={2.4} />
      </TouchableOpacity>
    </>
  );
});
