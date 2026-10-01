'use client'

import { createContext, useContext, type ReactNode } from 'react'

const KeyboardPlatformContext = createContext(false)

export function KeyboardPlatformProvider({ applePlatform, children }: Readonly<{
  applePlatform: boolean
  children: ReactNode
}>) {
  return <KeyboardPlatformContext.Provider value={applePlatform}>{children}</KeyboardPlatformContext.Provider>
}

export function useServerApplePlatform() {
  return useContext(KeyboardPlatformContext)
}
