import { StyleSheet, type ViewStyle } from 'react-native'
import { SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'

export function useContentFrameStyle(): ViewStyle {
  return styles.frame
}

const styles = StyleSheet.create({
  frame: { width: '100%', minWidth: 0, maxWidth: SHELL_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16 },
})
