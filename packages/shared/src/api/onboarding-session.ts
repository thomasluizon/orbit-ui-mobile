import { onboardingChallengeSchema, onboardingInstallSchema, onboardingSetupRequestSchema, onboardingSetupSuggestionSchema, type OnboardingAttestation, type OnboardingPlatform } from '../types/onboarding'
import type { HabitSetupSuggestion } from '../types/habit'
import type { SupportedLocale } from '../types/profile'
import { API } from './endpoints'

export const ONBOARDING_INSTALL_HEADER = 'X-Orbit-Install-Id'

export interface OnboardingAttester {
  platform: OnboardingPlatform
  enroll: (challenge: string) => Promise<OnboardingAttestation>
  assert: (binding: string) => Promise<OnboardingAttestation>
}

export type OnboardingTransport = (path: string, body: unknown, installId?: string) => Promise<{ body: unknown; installId: string | null }>

export function bindOnboardingSetup(installId: string, title: string, language: SupportedLocale): string {
  const bytes = new TextEncoder().encode(title.trim())
  const encodedTitle = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
  return `orbit-onboarding-setup-v1\n${installId}\n${encodedTitle}\n${language}`
}

export interface OnboardingSession {
  dispose: () => void
  suggest: (title: string, language: SupportedLocale, attester: OnboardingAttester) => Promise<HabitSetupSuggestion>
}

export function createOnboardingSession(transport: OnboardingTransport): OnboardingSession {
  let install: { installId: string; expiresAtUtc: string } | null = null
  let busy = false
  let disposed = false
  const isDisposed = () => disposed

  async function enroll(attester: OnboardingAttester) {
    const challengeResponse = await transport(API.onboarding.challenge, { platform: attester.platform })
    const { challenge } = onboardingChallengeSchema.parse(challengeResponse.body)
    const attestation = await attester.enroll(challenge)
    const response = await transport(API.onboarding.install, { challenge, attestation })
    return onboardingInstallSchema.parse(response.body)
  }

  return {
    dispose: () => { disposed = true; install = null },
    async suggest(title: string, language: SupportedLocale, attester: OnboardingAttester) {
      if (busy || isDisposed()) throw new Error('Onboarding session unavailable')
      busy = true
      try {
        const credential = install && Date.parse(install.expiresAtUtc) > Date.now() ? install : await enroll(attester)
        install = null
        if (isDisposed()) throw new Error('Onboarding session ended')
        const attestation = await attester.assert(bindOnboardingSetup(credential.installId, title, language))
        const request = onboardingSetupRequestSchema.parse({ title, language, attestation })
        if (isDisposed()) throw new Error('Onboarding session ended')
        const response = await transport(API.onboarding.suggestSetup, request, credential.installId)
        const suggestion = onboardingSetupSuggestionSchema.parse(response.body)
        if (!isDisposed() && response.installId) install = { ...credential, installId: response.installId }
        return suggestion
      } finally {
        busy = false
      }
    },
  }
}
