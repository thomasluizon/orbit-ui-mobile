'use client'

import { useCallback } from 'react'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { Profile } from '@orbit/shared/types/profile'

export function useRetainedOnboardingGuard(
  profile: Profile | null | undefined,
  suppressed: boolean,
  forceShow = false,
): boolean {
  return forceShow || (!suppressed && profile?.hasCompletedOnboarding === false)
}

/** Owns the source overlay until its explicit exit, independently of durable completion. */
export function useRetainedOnboardingSession(required: boolean) {
  const [status, setStatus] = useAccountScopedState<'waiting' | 'open' | 'closed'>(required ? 'open' : 'waiting')
  if (status === 'waiting' && required) setStatus('open')
  const dismiss = useCallback(() => setStatus('closed'), [setStatus])
  return { open: status === 'open' || (status === 'waiting' && required), dismiss }
}
