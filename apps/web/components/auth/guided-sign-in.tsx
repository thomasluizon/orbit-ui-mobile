'use client'

import { createContext, use, type ReactNode } from 'react'
import { useFlag } from '@/hooks/use-flag'

/** Whether the sign-in surfaces show the one-question flow. Off outside the provider. */
export const GuidedSignInContext = createContext(false)

/** Reads `orbit_guided_flows` once for the sign-in routes. Before sign-in no config exists, so it reads off and the current surface shows until the flag read goes away. */
export function GuidedSignInProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <GuidedSignInContext value={useFlag('orbit_guided_flows')}>{children}</GuidedSignInContext>
}

export function useGuidedSignIn(): boolean {
  return use(GuidedSignInContext)
}
