import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

export const DRAWER_CONTENT_BOTTOM_INSET = 96

export function withDrawerContentInset(
  style?: StyleProp<ViewStyle>,
): StyleProp<ViewStyle> {
  const flattened = StyleSheet.flatten(style)
  const paddingBottom =
    typeof flattened?.paddingBottom === 'number'
      ? flattened.paddingBottom
      : 0

  return [style, { paddingBottom: paddingBottom + DRAWER_CONTENT_BOTTOM_INSET }]
}
