import { StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'

export function useContentFrameStyle(cap: 560 | 620 | 652 = 560): ViewStyle {
  const { width } = useWindowDimensions()
  return {
    ...styles.frame,
    maxWidth: width >= WIDE_DESKTOP_BREAKPOINT ? cap + 2 * styles.frame.paddingHorizontal : undefined,
  }
}

const styles = StyleSheet.create({
  frame: { width: '100%', minWidth: 0, alignSelf: 'flex-start', paddingHorizontal: 16 },
})
