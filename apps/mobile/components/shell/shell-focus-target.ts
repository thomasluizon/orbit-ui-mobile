import type { HostInstance } from 'react-native'
import { createContext, useContext } from 'react'

export const ShellFocusTargetContext = createContext<{
  currentHost: () => HostInstance | null
  currentTarget: () => number | null
  focusMain: () => void
} | null>(null)

export function useShellFocusTarget() {
  return useContext(ShellFocusTargetContext)
}
