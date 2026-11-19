'use client'

import { createContext, use } from 'react'

/** Whether the sign-in surfaces show the one-question flow. Off outside the provider. */
export const GuidedSignInContext = createContext(false)

export function useGuidedSignIn(): boolean {
  return use(GuidedSignInContext)
}
