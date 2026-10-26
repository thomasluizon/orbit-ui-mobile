import { createContext, useContext } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const ShellSideInsetsContext = createContext(false)

export function useShellSideInsets() {
  const owned = useContext(ShellSideInsetsContext)
  const { left, right } = useSafeAreaInsets()
  return owned ? { left: 0, right: 0 } : { left, right }
}
