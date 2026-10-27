'use client'

import { useEffect, useRef, useState } from 'react'
import { API, createOnboardingSession, type OnboardingAttester, type OnboardingTransport } from '@orbit/shared/api'
import type { SupportedLocale } from '@orbit/shared/types/profile'
import { requestAnonymousOnboarding } from '@/app/actions/onboarding'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { desktopRuntime } from '@/lib/desktop-runtime'
import { useHabitSuggestion } from './use-habit-suggestion'
import { useOffline } from './use-offline'

const transport: OnboardingTransport = async (path, body, installId) => {
  const operation = path === API.onboarding.challenge ? 'challenge' : path === API.onboarding.install ? 'install' : 'suggestSetup'
  const result = await requestAnonymousOnboarding(operation, body, installId)
  if (!result.ok) throw new Error('Anonymous onboarding unavailable')
  return result.data
}

function useOnboardingProof(siteKey: string | undefined) {
  const [request, setRequest] = useState<number | null>(null)
  const sequence = useRef(0)
  const pending = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null)
  function finish(token: string | null) {
    const current = pending.current
    if (!current) return
    pending.current = null
    clearTimeout(current.timer)
    setRequest(null)
    if (token) current.resolve(token)
    else current.reject(new Error('Onboarding proof unavailable'))
  }
  useEffect(() => () => {
    const current = pending.current
    pending.current = null
    if (current) { clearTimeout(current.timer); current.reject(new Error('Onboarding ended')) }
  }, [])
  return {
    cancel: () => finish(null),
    requestToken: () => new Promise<string>((resolve, reject) => {
      if (!siteKey) { reject(new Error('Turnstile unavailable')); return }
      finish(null)
      pending.current = { resolve, reject, timer: setTimeout(() => finish(null), 30000) }
      sequence.current += 1
      setRequest(sequence.current)
    }),
    verification: request !== null && siteKey ? <TurnstileWidget key={request} siteKey={siteKey} resetKey={0} quiet onToken={(token) => { if (token) finish(token) }} onStateChange={(state) => { if (state === 'failed' || state === 'expired') finish(null) }} /> : null,
  }
}

export function useOnboardingSuggestion(isLive: boolean) {
  const authorized = useHabitSuggestion()
  const { isOnline } = useOffline()
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const proof = useOnboardingProof(siteKey)
  const session = useRef<ReturnType<typeof createOnboardingSession> | null>(null)
  useEffect(() => () => { session.current?.dispose(); session.current = null }, [])
  return {
    available: isOnline && (isLive || Boolean(siteKey)),
    verification: proof.verification,
    cancel: () => { session.current?.dispose(); session.current = null; proof.cancel() },
    async mutateAsync(input: { title: string; language: SupportedLocale }) {
      if (isLive) return authorized.mutateAsync(input)
      session.current ??= createOnboardingSession(transport)
      const platform = desktopRuntime() ? 'desktop' : 'web'
      const prove: OnboardingAttester['enroll'] = async () => ({ platform, token: await proof.requestToken() })
      return session.current.suggest(input.title, input.language, { platform, enroll: prove, assert: prove })
    },
  }
}
