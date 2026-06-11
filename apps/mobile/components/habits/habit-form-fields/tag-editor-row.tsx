import { View, Text, TouchableOpacity } from "react-native";
import { X } from "lucide-react-native";
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
        maxLength={50}
        accessibilityLabel={inputAriaLabel}
        editable={!disabled}
        style={{ flex: 1 }}
        onChangeText={onChange}
        onSubmitEditing={onCommit}
      />
      <TouchableOpacity
        style={styles.tagFormSave}
        disabled={disabled}
        onPress={onCommit}
        activeOpacity={0.7}
      >
        <Text style={styles.tagFormSaveText}>{actionLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tagFormCancel}
        accessibilityLabel={cancelAriaLabel}
        disabled={disabled}
        onPress={onCancel}
        activeOpacity={0.7}
      >
        <X size={16} color={tokens.fg3} strokeWidth={1.8} />
      </TouchableOpacity>
    </View>
  );
}
