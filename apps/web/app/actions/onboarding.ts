'use server'

import type {
  ApplyOnboardingRequest,
  ApplyOnboardingResponse,
} from '@orbit/shared/types/onboarding'
import { API, ONBOARDING_INSTALL_HEADER } from '@orbit/shared/api'
import { onboardingChallengeRequestSchema, onboardingEnrollmentRequestSchema, onboardingSetupRequestSchema } from '@orbit/shared/types/onboarding'
import { z } from 'zod'
import { headers } from 'next/headers'
import { buildBffForwardingHeaders } from '@/app/api/_utils/bff-forwarding'
import { serverAuthMutate, serverPublicFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function requestAnonymousOnboarding(operation: 'challenge' | 'install' | 'suggestSetup', input: unknown, installId?: string) {
  return wrapServerAction(async () => {
    const name = z.enum(['challenge', 'install', 'suggestSetup']).parse(operation)
    const schemas = { challenge: onboardingChallengeRequestSchema, install: onboardingEnrollmentRequestSchema, suggestSetup: onboardingSetupRequestSchema }
    const incoming = await headers()
    let rotatedInstallId: string | null = null
    const body = await serverPublicFetch(API.onboarding[name], {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      headers: {
        ...buildBffForwardingHeaders(new Request('https://onboarding.invalid', { headers: incoming })),
        ...(installId ? { [ONBOARDING_INSTALL_HEADER]: z.string().min(1).max(4096).parse(installId) } : {}),
      },
      body: JSON.stringify(schemas[name].parse(input)),
    }, undefined, (responseHeaders) => { rotatedInstallId = responseHeaders.get(ONBOARDING_INSTALL_HEADER) })
    return { body, installId: rotatedInstallId }
  })
}

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
