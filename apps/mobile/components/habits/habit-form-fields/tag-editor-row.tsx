import { View, Text, Pressable } from "react-native";
import { X } from '@/components/ui/icons';
import { MAX_TAG_NAME_LENGTH } from "@orbit/shared/validation";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { type AppTokens, createStyles } from "./styles";

interface TagEditorRowProps {
  value: string;
  placeholder?: string;
  inputAriaLabel: string;
  actionLabel: string;
  cancelAriaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  styles: ReturnType<typeof createStyles>;
  tokens: AppTokens;
}

export function TagEditorRow({
  value,
  placeholder,
  inputAriaLabel,
  actionLabel,
  cancelAriaLabel,
  disabled,
  onChange,
  onCommit,
  onCancel,
  styles,
  tokens,
}: Readonly<TagEditorRowProps>) {
  return (
    <View style={styles.tagFormRow}>
      <BottomSheetAppTextInput
        value={value}
        placeholder={placeholder}
        maxLength={MAX_TAG_NAME_LENGTH}
        accessibilityLabel={inputAriaLabel}
        editable={!disabled}
        style={{ flex: 1 }}
        onChangeText={onChange}
        onSubmitEditing={onCommit}
      />
      <Pressable
        style={({ pressed }) => [
          styles.tagFormSave,
          disabled && { opacity: 0.45 },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
        hitSlop={{ top: 3, bottom: 3 }}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        disabled={disabled}
        onPress={onCommit}
      >
        <Text style={styles.tagFormSaveText}>{actionLabel}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.tagFormCancel,
          disabled && { opacity: 0.45 },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={cancelAriaLabel}
        disabled={disabled}
        onPress={onCancel}
      >
        <X size={16} color={tokens.fg3} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}
