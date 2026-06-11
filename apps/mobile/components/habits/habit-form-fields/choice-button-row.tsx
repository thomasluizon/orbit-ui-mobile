import { type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
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
        <Pressable
          key={option.key}
          style={({ pressed }) => [
            buttonStyle,
            option.active && activeButtonStyle,
            pressed ? { transform: [{ scale: 0.96 }] } : null,
          ]}
          onPress={option.onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: option.active }}
        >
          <Text style={[textStyle, option.active && activeTextStyle]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
