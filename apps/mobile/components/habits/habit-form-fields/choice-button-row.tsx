import { type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

interface ChoiceButtonOption {
  key: string;
  label: ReactNode;
  active: boolean;
  onPress: () => void;
}

interface ChoiceButtonRowProps {
  containerStyle: StyleProp<ViewStyle>;
  buttonStyle: StyleProp<ViewStyle>;
  activeButtonStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  activeTextStyle: StyleProp<TextStyle>;
  options: ChoiceButtonOption[];
}

export function ChoiceButtonRow({
  containerStyle,
  buttonStyle,
  activeButtonStyle,
  textStyle,
  activeTextStyle,
  options,
}: Readonly<ChoiceButtonRowProps>) {
  return (
    <View style={containerStyle}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.key}
          style={[buttonStyle, option.active && activeButtonStyle]}
          onPress={option.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: option.active }}
        >
          <Text style={[textStyle, option.active && activeTextStyle]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
