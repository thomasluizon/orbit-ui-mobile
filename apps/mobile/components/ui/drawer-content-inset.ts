import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

// Keep enough trailing space after the last control so bottom-sheet CTAs can
// scroll fully above the gesture/navigation area on smaller Android screens.
export const DRAWER_CONTENT_BOTTOM_INSET = 128

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
