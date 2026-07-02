import { View, Pressable } from "react-native";
import { createStyles } from "./styles";

interface TagColorPickerProps {
  colors: readonly string[];
  activeColor: string;
  onSelect: (color: string) => void;
  ariaLabel: (color: string) => string;
  styles: ReturnType<typeof createStyles>;
}

export function TagColorPicker({
  colors,
  activeColor,
  onSelect,
  ariaLabel,
  styles,
}: Readonly<TagColorPickerProps>) {
  return (
    <View style={styles.colorPicker}>
      {colors.map((color) => (
        <Pressable
          key={color}
          style={({ pressed }) => [
            styles.colorCell,
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
          accessibilityLabel={ariaLabel(color)}
          accessibilityRole="button"
          accessibilityState={{ selected: activeColor === color }}
          onPress={() => onSelect(color)}
        >
          <View
            style={[
              styles.colorDot,
              { backgroundColor: color },
              activeColor === color && styles.colorDotSelected,
            ]}
          />
        </Pressable>
      ))}
    </View>
  );
}
