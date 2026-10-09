'use client'

import { createContext, useContext, type ReactNode } from 'react'

const SessionCookieContext = createContext(false)

export function SessionCookieProvider({ hasSessionCookie, children }: Readonly<{
  hasSessionCookie: boolean
  children: ReactNode
}>) {
  return <SessionCookieContext.Provider value={hasSessionCookie}>{children}</SessionCookieContext.Provider>
}

export function useHasSessionCookie() {
  return useContext(SessionCookieContext)
}
