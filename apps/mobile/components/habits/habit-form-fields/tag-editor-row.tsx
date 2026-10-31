import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { useEffect, useRef } from 'react'
import { useHabitFormInteraction } from './habit-form-interaction'
import type { TextInput } from 'react-native'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { View, Text, } from "react-native";
import { X } from "@/components/ui/icons";
import { MAX_TAG_NAME_LENGTH } from "@orbit/shared/validation";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { type AppTokens, createStyles } from "./styles";

interface TagEditorRowProps {
  initialValue?: string
  error?: string
  focusRequest?: number
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
  initialValue = '',
  error,
  focusRequest,
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
  const { isDisabled } = useHabitFormInteraction()
  const dismiss = useDismissGuard({ isDirty: value !== initialValue, onDismiss: onCancel })
  const requestCancel = () => { if (!disabled) dismiss.requestDismiss() }
  const inputRef = useRef<TextInput>(null)
  useEffect(() => { if (focusRequest) inputRef.current?.focus() }, [focusRequest])
  return (
    <><View style={styles.tagEditor}>
    <View style={styles.tagFormRow}>
      <BottomSheetAppTextInput
        isChangeDisabled={isDisabled}
        ref={inputRef}
        accessibilityHint={error}
        value={value}
        placeholder={placeholder}
        maxLength={MAX_TAG_NAME_LENGTH}
        accessibilityLabel={inputAriaLabel}
        editable={!disabled}
        accessibilityState={{ disabled }}
        style={{ flex: 1 }}
        onChangeText={onChange}
        onSubmitEditing={onCommit}
      />
      <Pressable
        style={({ pressed }) => [
          styles.tagFormSave,
          disabled && { opacity: 0.45 },
          pressed && { backgroundColor: tokens.primaryPressed, transform: [{ scale: 0.96 }] },
        ]}

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
          pressed && { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
        ]}

        accessibilityRole="button"
        accessibilityLabel={cancelAriaLabel}
        disabled={disabled}
        onPress={requestCancel}
      >
        <X size={16} color={tokens.fg3} strokeWidth={1.8} />
      </Pressable>
    </View>
    {error ? <Text style={[styles.fieldError, styles.tagEditorError]}>{error}</Text> : null}
    </View>
    <DiscardChangesSheet open={dismiss.showDiscardDialog} onKeepEditing={dismiss.cancelDismiss} onDiscard={dismiss.confirmDismiss} />
    </>
  );
}
