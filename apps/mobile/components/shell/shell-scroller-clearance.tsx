import { createContext, useContext } from 'react'
import type { Edge } from 'react-native-safe-area-context'

export const SHELL_SCROLLER_CLEARANCE = 96
export const SHELL_PAGE_END_INSET = 24
export const ShellScrollerClearanceContext = createContext(0)

export function useShellScrollerClearance() {
  return useContext(ShellScrollerClearanceContext)
}

/** A pushed page's end spacing: the shell's clearance under pinned chrome, else its own inset above the system bar. */
export function useShellPageEnd(): Readonly<{ paddingBottom: number; safeAreaEdges: readonly Edge[] }> {
  const clearance = useShellScrollerClearance()
  return clearance === 0
    ? { paddingBottom: SHELL_PAGE_END_INSET, safeAreaEdges: ['top', 'bottom'] }
    : { paddingBottom: clearance, safeAreaEdges: ['top'] }
}
