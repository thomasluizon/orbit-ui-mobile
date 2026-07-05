import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, goalKeys, profileKeys, gamificationKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useApplyOnboarding } from '@/hooks/use-apply-onboarding'

/**
 * After any successful auth, flushes buffered onboarding answers to the idempotent
 * apply endpoint. On a 2xx the local draft is cleared and the profile cache is
 * marked onboarded; on failure the draft is left for retry on the next authenticated
 * mount. Concurrent runs are guarded so a single flush is in flight at a time.
 */
export function useOnboardingFlush(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasHydrated = useOnboardingDraftStore((s) => s._hasHydrated)
  const pendingAnswers = useOnboardingDraftStore((s) => s.hasPendingAnswers())
  const queryClient = useQueryClient()
  const applyOnboarding = useApplyOnboarding()
  const runningRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !hasHydrated || !pendingAnswers) return
    if (runningRef.current) return
    runningRef.current = true

    let cancelled = false

    async function flush() {
      try {
        await applyOnboarding()
        if (cancelled) return
        useOnboardingDraftStore.getState().reset()
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, hasCompletedOnboarding: true } : old,
        )
        queryClient.invalidateQueries({ queryKey: habitKeys.all })
        queryClient.invalidateQueries({ queryKey: goalKeys.all })
        queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
        queryClient.invalidateQueries({ queryKey: profileKeys.all })
      } catch {
      } finally {
        runningRef.current = false
      }
    }

    void flush()

    return () => {
      cancelled = true
    }
  }, [applyOnboarding, hasHydrated, isAuthenticated, pendingAnswers, queryClient])
}
