import { View, TouchableOpacity } from "react-native";
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
        <TouchableOpacity
          key={color}
          style={[
            styles.colorDot,
            { backgroundColor: color },
            activeColor === color && styles.colorDotSelected,
          ]}
          accessibilityLabel={ariaLabel(color)}
          accessibilityRole="button"
          onPress={() => onSelect(color)}
          activeOpacity={0.7}
        />
      ))}
    </View>
  );
}
