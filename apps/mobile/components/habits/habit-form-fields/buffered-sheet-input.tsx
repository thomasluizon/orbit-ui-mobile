import { memo, useEffect, useState, useCallback } from "react";
import { type StyleProp, type TextStyle } from "react-native";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";

interface BufferedSheetInputProps {
  value: string;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  transformDraft?: (value: string) => string;
  registerFlush?: (flush: () => void) => () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  placeholderTextColor?: string;
  maxLength?: number;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
  textAlignVertical?: "auto" | "top" | "center" | "bottom";
}

export const BufferedSheetInput = memo(function BufferedSheetInput({
  value,
  onCommit,
  onDraftChange,
  transformDraft,
  registerFlush,
  onFocus,
  onBlur,
  onSubmitEditing,
  ...props
}: Readonly<BufferedSheetInputProps>) {
  const [draft, setDraft] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const displayValue = value !== previousValue && !isFocused ? value : draft;

  useEffect(() => {
    if (value === previousValue) return;
    void Promise.resolve().then(() => {
      setPreviousValue(value);
      if (!isFocused) setDraft(value);
    });
  }, [isFocused, previousValue, value]);

  const commitDraft = useCallback(() => {
    if (draft !== value) {
      onCommit(draft);
    }
  }, [draft, onCommit, value]);

  // react-doctor-disable-next-line no-prop-callback-in-effect -- registers/unregisters the commit-flush handle with the parent (cleanup returns the unregister); an imperative registration handle, not a state sync https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => registerFlush?.(commitDraft), [commitDraft, registerFlush]);

  const handleChangeText = useCallback(
    (nextValue: string) => {
      const nextDraft = transformDraft ? transformDraft(nextValue) : nextValue;
      setDraft(nextDraft);
      onDraftChange?.(nextDraft);
    },
    [onDraftChange, transformDraft],
  );

  return (
    <BottomSheetAppTextInput
      {...props}
      value={displayValue}
      onChangeText={handleChangeText}
      onFocus={() => {
        setIsFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setIsFocused(false);
        commitDraft();
        onBlur?.();
      }}
      onEndEditing={commitDraft}
      onSubmitEditing={() => {
        commitDraft();
        onSubmitEditing?.();
      }}
    />
  );
});
