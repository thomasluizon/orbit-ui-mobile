import { View, Text, TouchableOpacity } from "react-native";
import { X, PenSquare } from "lucide-react-native";
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
        !selected && atLimit && { opacity: 0.3 },
      ]}
    >
      <TouchableOpacity
        style={styles.tagChipMain}
        disabled={!selected && atLimit}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={tag.name}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        {!selected && (
          <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
        )}
        <Text
          style={[styles.tagChipText, selected && { color: tokens.fgOnPrimary }]}
        >
          {tag.name}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tagAction}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={editAriaLabel}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <PenSquare
          size={13}
          strokeWidth={1.8}
          color={selected ? tokens.fgOnPrimary : tokens.fg3}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tagAction}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={deleteAriaLabel}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        onPress={onDelete}
        activeOpacity={0.7}
      >
        <X
          size={13}
          strokeWidth={1.8}
          color={selected ? tokens.fgOnPrimary : tokens.fg3}
        />
      </TouchableOpacity>
    </View>
  );
}
