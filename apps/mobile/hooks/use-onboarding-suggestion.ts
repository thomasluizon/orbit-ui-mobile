import { useEffect, useRef } from 'react'
import { createOnboardingSession, ONBOARDING_INSTALL_HEADER, type OnboardingAttester, type OnboardingTransport } from '@orbit/shared/api'
import type { SupportedLocale } from '@orbit/shared/types/profile'
import { useHabitSuggestion } from './use-habit-suggestion'
import { useOffline } from './use-offline'
import { apiClient } from '@/lib/api-client'
import { canAttestOnboarding, createOnboardingAttester } from '@/lib/onboarding-attestation'

const transport: OnboardingTransport = async (path, body, installId) => {
  let rotated: string | null = null
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await apiClient(path, {
      method: 'POST', body: JSON.stringify(body), silent: true, skipAuthRecovery: true,
      signal: controller.signal,
      headers: installId ? { [ONBOARDING_INSTALL_HEADER]: installId } : {},
      onResponseHeaders: (headers) => { rotated = headers.get(ONBOARDING_INSTALL_HEADER) },
    })
    return { body: response, installId: rotated }
  } finally { clearTimeout(deadline) }
}

export function useOnboardingSuggestion(isLive: boolean) {
  const authorized = useHabitSuggestion()
  const { isOnline } = useOffline()
  const session = useRef<ReturnType<typeof createOnboardingSession> | null>(null)
  const attester = useRef<OnboardingAttester | null>(null)
  function cancel() { session.current?.dispose(); session.current = null; attester.current = null }
  useEffect(() => cancel, [])
  return {
    available: isOnline && (isLive || canAttestOnboarding()),
    verification: null,
    cancel,
    async mutateAsync(input: { title: string; language: SupportedLocale }) {
      if (isLive) return authorized.mutateAsync(input)
      session.current ??= createOnboardingSession(transport)
      const current = session.current
      attester.current ??= await createOnboardingAttester()
      return current.suggest(input.title, input.language, attester.current)
    },
  }
}
