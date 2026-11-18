'use client'

import type { ReactNode } from 'react'
import { useFlag } from '@/hooks/use-flag'
import { GuidedSignInContext } from './guided-sign-in'

/** Reads `orbit_guided_flows` once for the sign-in routes. Before sign-in no config exists, so it reads off and the current surface shows until the flag read goes away. It lives apart from the reader, so a sign-in surface does not import the config. */
export function GuidedSignInProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <GuidedSignInContext value={useFlag('orbit_guided_flows')}>{children}</GuidedSignInContext>
}
