import type { ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'

/**
 * The slot of an action that advances a flow step: the continue of a free path. In the compact shell the action takes the full width.
 * At 1024 and above it hugs its label, at most 360 wide, in the centre.
 */
export function PrimaryActionSlot({ children }: Readonly<{ children: ReactNode }>) {
  const { width } = useWindowDimensions()
  return <View testID="primary-action-slot" style={width >= WIDE_DESKTOP_BREAKPOINT ? styles.wide : styles.compact}>{children}</View>
}

const styles = StyleSheet.create({
  compact: { alignSelf: 'stretch' },
  wide: { alignSelf: 'center', maxWidth: 360 },
})
