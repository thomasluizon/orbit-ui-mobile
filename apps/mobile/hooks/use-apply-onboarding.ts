import { useCallback } from 'react'
import { API } from '@orbit/shared/api'
import {
  applyOnboardingResponseSchema,
  type ApplyOnboardingResponse,
} from '@orbit/shared/types'
import { apiClient } from '@/lib/api-client'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

/**
 * Builds the apply payload from the persisted draft store and POSTs it directly
 * (not through the offline queue) so the caller observes the real 2xx before
 * clearing local answers. Returns the parsed, idempotent apply response.
 */
export function useApplyOnboarding(): () => Promise<ApplyOnboardingResponse> {
  return useCallback(async () => {
    const payload = useOnboardingDraftStore.getState().buildApplyPayload()
    const response = await apiClient<unknown>(API.profile.onboardingApply, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return applyOnboardingResponseSchema.parse(response)
  }, [])
}
