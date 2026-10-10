import type { ColorValue, ViewStyle } from 'react-native'

export function selectedBorderStyle(selected: boolean, focused: boolean, width: number | undefined, color: ColorValue): ViewStyle | undefined {
  if (!selected || width === undefined) return undefined
  return { borderWidth: width, borderColor: focused ? 'transparent' : color }
}
