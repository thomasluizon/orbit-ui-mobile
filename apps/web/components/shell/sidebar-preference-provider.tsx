'use client'

import { createContext, useContext, type ReactNode } from 'react'

const InitialSidebarCollapsedContext = createContext(false)

/**
 * Carries the sidebar preference the server read from its cookie, so the server
 * render and the hydration render draw the saved sidebar width on the first frame.
 */
export function SidebarPreferenceProvider({ initialCollapsed, children }: Readonly<{ initialCollapsed: boolean; children: ReactNode }>) {
  return <InitialSidebarCollapsedContext value={initialCollapsed}>{children}</InitialSidebarCollapsedContext>
}

export function useInitialSidebarCollapsed(): boolean {
  return useContext(InitialSidebarCollapsedContext)
}
