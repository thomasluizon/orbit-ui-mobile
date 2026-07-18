import { View, Text, Pressable } from "react-native";
import { X, PenSquare } from '@/components/ui/icons';
import { type AppTokens, createStyles } from "./styles";

interface HabitTagChipProps {
  tag: { id: string; name: string; color: string };
  selected: boolean;
  atLimit: boolean;
  disabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editAriaLabel: string;
  deleteAriaLabel: string;
  styles: ReturnType<typeof createStyles>;
  tokens: AppTokens;
}

export function HabitTagChip({
  tag,
  selected,
  atLimit,
  disabled,
  onToggle,
  onEdit,
  onDelete,
  editAriaLabel,
  deleteAriaLabel,
  styles,
  tokens,
}: Readonly<HabitTagChipProps>) {
  return (
    <View
      style={[
        styles.tagChip,
        selected && { backgroundColor: tag.color },
        !selected && styles.tagChipInactive,
        !selected && atLimit && { opacity: 0.45 },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.tagChipMain,
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
        hitSlop={{ top: 4, bottom: 4 }}
        disabled={!selected && atLimit}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={tag.name}
        onPress={onToggle}
      >
        {!selected && (
          <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
        )}
        <Text
          style={[
            styles.tagChipText,
            selected && { color: "white" },
          ]}
        >
          {tag.name}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.tagAction,
          disabled && { opacity: 0.45 },
          !disabled && selected && { opacity: 0.7 },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={editAriaLabel}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        onPress={onEdit}
      >
        <PenSquare
          size={13}
          strokeWidth={1.8}
          color={selected ? "white" : tokens.fg3}
        />
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.tagAction,
          disabled && { opacity: 0.45 },
          !disabled && selected && { opacity: 0.7 },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={deleteAriaLabel}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        onPress={onDelete}
      >
        <X
          size={13}
          strokeWidth={1.8}
          color={selected ? "white" : tokens.fg3}
        />
      </Pressable>
    </View>
  );
}
