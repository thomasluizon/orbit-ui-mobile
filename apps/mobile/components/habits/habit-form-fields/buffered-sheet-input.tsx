import { memo, useEffect, useState, useCallback, useRef } from "react";
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
  const [prevValue, setPrevValue] = useState(value);
  const isFocusedRef = useRef(false);
  const lastSyncedValueRef = useRef(value);

  if (value !== prevValue) {
    setPrevValue(value);
    if (!isFocusedRef.current && value !== lastSyncedValueRef.current) {
      setDraft(value);
      lastSyncedValueRef.current = value;
    }
  }

  const commitDraft = useCallback(() => {
    if (draft !== value) {
      onCommit(draft);
    }
    lastSyncedValueRef.current = draft;
  }, [draft, onCommit, value]);

  useEffect(() => registerFlush?.(commitDraft), [commitDraft, registerFlush]);

  const handleChangeText = useCallback(
    (nextValue: string) => {
      const nextDraft = transformDraft ? transformDraft(nextValue) : nextValue;
      setDraft(nextDraft);
      lastSyncedValueRef.current = nextDraft;
      onDraftChange?.(nextDraft);
    },
    [onDraftChange, transformDraft],
  );

  return (
    <BottomSheetAppTextInput
      {...props}
      value={draft}
      onChangeText={handleChangeText}
      onFocus={() => {
        isFocusedRef.current = true;
        onFocus?.();
      }}
      onBlur={() => {
        isFocusedRef.current = false;
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
