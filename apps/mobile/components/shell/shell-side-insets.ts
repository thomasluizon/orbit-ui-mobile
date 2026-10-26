import { SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import type { ViewStyle } from 'react-native'
import { createContext, useContext } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const ShellSideInsetsContext = createContext(false)

export function useShellSideInsets() {
  const owned = useContext(ShellSideInsetsContext)
  const { left, right } = useSafeAreaInsets()
  return owned ? { left: 0, right: 0 } : { left, right }
}

export function useShellContentStyle(gutter = 0): ViewStyle {
  const { left, right } = useShellSideInsets()
  return { alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH + left + right, paddingLeft: gutter + left, paddingRight: gutter + right }
}
