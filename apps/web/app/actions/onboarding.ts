'use server'

import type {
  ApplyOnboardingRequest,
  ApplyOnboardingResponse,
} from '@orbit/shared/types/onboarding'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function applyOnboarding(
  payload: ApplyOnboardingRequest,
): Promise<ApplyOnboardingResponse> {
  return serverAuthFetch<ApplyOnboardingResponse>(API.profile.onboardingApply, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function dismissImportPrompt(): Promise<void> {
  await serverAuthFetch(API.profile.importPromptDismiss, {
    method: 'PUT',
  })
}
