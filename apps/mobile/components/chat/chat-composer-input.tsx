import { memo, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ArrowUp } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AppTextInput } from "@/components/ui/app-text-input";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

interface ChatComposerInputProps {
  draft: string;
  canSend: boolean;
  isOnline: boolean;
  limitLocked: boolean;
  placeholder: string;
  tokens: Tokens;
  styles: ChatStyles;
  fieldAccessories?: ReactNode;
  onChangeDraft: (text: string) => void;
  onSubmit: () => void;
}

export const ChatComposerInput = memo(function ChatComposerInput({
  draft,
  canSend,
  isOnline,
  limitLocked,
  placeholder,
  tokens,
  styles,
  fieldAccessories,
  onChangeDraft,
  onSubmit,
}: Readonly<ChatComposerInputProps>) {
  const { t } = useTranslation();

  return (
    <>
      <View style={[styles.composerField, limitLocked && styles.composerFieldLocked]}>
        <AppTextInput
          style={[styles.textInput, { color: tokens.fg1 }]}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={placeholder}
          placeholderTextColor={tokens.fg3}
          multiline
          maxLength={2000}
          editable={isOnline && !limitLocked}
          returnKeyType="default"
          blurOnSubmit={false}
          onSubmitEditing={onSubmit}
        />
        {fieldAccessories}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.sendButton,
          canSend && isOnline ? styles.sendButtonGlow : styles.sendButtonDisabled,
          pressed && canSend && isOnline && styles.sendButtonPressed,
        ]}
        onPress={onSubmit}
        disabled={!canSend || !isOnline}
        accessibilityRole="button"
        accessibilityLabel={t("chat.send")}
        accessibilityState={{ disabled: !canSend || !isOnline }}
      >
        <ArrowUp size={22} color={tokens.fgOnPrimary} strokeWidth={2.4} />
      </Pressable>
    </>
  );
});
