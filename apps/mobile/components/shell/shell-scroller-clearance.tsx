import { createContext, useContext } from 'react'

export const SHELL_SCROLLER_CLEARANCE = 96
export const ShellScrollerClearanceContext = createContext(0)

export function useShellScrollerClearance() {
  return useContext(ShellScrollerClearanceContext)
}
