'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { getPersistedOnboardingDraft } from '@orbit/shared/stores'
import { getHeldAccountId, useAuthStore, withCookieSettingLogin } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { fetchWithUpgradeGuidance } from '@/lib/api-fetch'

const notificationSchema = z.object({ phase: z.enum(['begin', 'ready']), state: z.string().regex(/^[a-f0-9]{64}$/) })
const sessionSchema = z.object({ userId: z.string().min(1), expiresAt: z.number(), refreshFailed: z.literal(false) })
type DesktopRuntime = { invoke: (command: string, payload: { state: string }) => Promise<unknown> }

export function DesktopAuthBridge() {
  const router = useRouter()
  useEffect(() => {
    const runtime = (window as Window & { __TAURI_INTERNALS__?: DesktopRuntime }).__TAURI_INTERNALS__
    if (!runtime) return
    const invoke = runtime.invoke
    let pending: { state: string; generation: number; completing: boolean; draft: ReturnType<typeof getPersistedOnboardingDraft> } | null = null

    async function complete(attempt: NonNullable<typeof pending>) {
      await withCookieSettingLogin(async () => {
        if (pending !== attempt || attempt.generation !== getAccountGeneration()) return
        if (await invoke('commit_desktop_login', { state: attempt.state }) !== true) return
        if (pending !== attempt || attempt.generation !== getAccountGeneration()) return
        const response = await fetchWithUpgradeGuidance('/api/auth/session')
        if (!response.ok) throw new Error('Cannot read desktop session')
        const session = sessionSchema.parse(await response.json())
        if (pending !== attempt || attempt.generation !== getAccountGeneration()) return
        const preserveAnonymousDraft = attempt.draft.accountKey === null && getHeldAccountId() === null
        if (preserveAnonymousDraft) useOnboardingDraftStore.setState(attempt.draft)
        useOnboardingDraftStore.getState().setAccountScope(session.userId, preserveAnonymousDraft)
        await useAuthStore.getState().checkSession()
        if (pending !== attempt || getHeldAccountId() !== session.userId) return
        pending = null
        router.replace('/')
      })
    }

    function receive(event: Event) {
      if (!(event instanceof CustomEvent)) return
      const parsed = notificationSchema.safeParse(event.detail)
      if (!parsed.success) return
      if (parsed.data.phase === 'begin') {
        pending = { state: parsed.data.state, generation: getAccountGeneration(), completing: false,
          draft: getPersistedOnboardingDraft(useOnboardingDraftStore.getState()) }
      } else if (pending?.state === parsed.data.state && !pending.completing) {
        const attempt = pending
        attempt.completing = true
        void complete(attempt).catch(() => {
          if (pending === attempt && attempt.generation === getAccountGeneration()) {
            pending = null
            router.replace('/auth-callback?error=desktop_sign_in_failed')
          }
        })
      }
    }
    window.addEventListener('orbit-desktop-auth', receive)
    return () => { pending = null; window.removeEventListener('orbit-desktop-auth', receive) }
  }, [router])
  return null
}
