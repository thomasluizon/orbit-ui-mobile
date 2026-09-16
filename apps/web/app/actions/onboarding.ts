'use server'

import type {
  ApplyOnboardingRequest,
  ApplyOnboardingResponse,
} from '@orbit/shared/types/onboarding'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function applyOnboarding(
  payload: ApplyOnboardingRequest,
): Promise<ServerActionResult<ApplyOnboardingResponse>> {
  return wrapServerAction(() => serverAuthFetch<ApplyOnboardingResponse>(API.profile.onboardingApply, {
    method: 'POST',
    body: JSON.stringify(payload),
  }))
}

export async function dismissImportPrompt(): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.importPromptDismiss, {
    method: 'PUT',
  }))
}
