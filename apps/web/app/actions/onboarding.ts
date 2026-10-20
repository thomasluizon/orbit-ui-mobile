'use server'

import type {
  ApplyOnboardingRequest,
  ApplyOnboardingResponse,
} from '@orbit/shared/types/onboarding'
import { API } from '@orbit/shared/api'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function applyOnboarding(
  payload: ApplyOnboardingRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<ApplyOnboardingResponse>> {
  return wrapServerAction(
    () => serverAuthMutate<ApplyOnboardingResponse>(API.profile.onboardingApply, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, intendedAccountId),
  )
}

export async function dismissImportPrompt(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.importPromptDismiss, {
    method: 'PUT',
  }, intendedAccountId))
}
