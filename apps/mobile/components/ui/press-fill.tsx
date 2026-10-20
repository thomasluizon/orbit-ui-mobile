import { StyleSheet, View } from 'react-native'

export function PressFill({ pressed, color }: Readonly<{ pressed: boolean; color: string }>) {
  return <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: pressed ? 1 : 0 }]} />
}
