import type { FocusEvent, HostInstance } from 'react-native'
import { createContext, useContext } from 'react'

export const ShellFocusTargetContext = createContext<{
  currentHost: () => HostInstance | null
  currentTarget: () => number | null
  focusMain: () => void
} | null>(null)

export function useShellFocusTarget() {
  return useContext(ShellFocusTargetContext)
}

export const ShellListFocusContext = createContext<((target: HostInstance, scrollBy: (offset: number) => void) => void) | null>(null)

export function useShellListFocus(scrollBy: (offset: number) => void) {
  const reveal = useContext(ShellListFocusContext)
  return (event: FocusEvent) => reveal?.(event.target, scrollBy)
}
