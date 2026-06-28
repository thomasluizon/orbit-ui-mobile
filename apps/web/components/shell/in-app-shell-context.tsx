'use client'

import { createContext, useContext, type ReactNode } from 'react'

const InAppShellContext = createContext(false)

/**
 * Marks its subtree as living inside the desktop app shell (the `(app)` route
 * group). The shell owns a single sticky top bar, so per-page header chrome reads
 * this flag to suppress itself on desktop. Route groups not wrapped by the shell
 * (`(auth)`, `(chat)`, `(public)`) never see the provider, so their bars stay.
 */
export function InAppShellProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <InAppShellContext.Provider value={true}>{children}</InAppShellContext.Provider>
}

/** True only for components rendered inside the `(app)` shell. Defaults to false. */
export function useInAppShell(): boolean {
  return useContext(InAppShellContext)
}
