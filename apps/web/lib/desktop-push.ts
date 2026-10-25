'use client'

import { z } from 'zod'
import { desktopPushRegistrationSchema, type DesktopPushRegistration } from '@orbit/shared/types/push-subscription'
import { subscribePush, unsubscribePushForCleanup } from '@/lib/actions/notifications'
import { serializePushSubscriptionMutation } from '@/lib/push-subscription-owner'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
import type { PushPreferenceSnapshot } from '@/hooks/use-push-notification-preferences'
import { desktopRuntime } from '@/lib/desktop-runtime'

const snapshotSchema = z.object({
  supported: z.boolean(),
  permission: z.enum(['unsupported', 'default', 'granted', 'denied']),
  owner: z.string().nullable(),
  registration: desktopPushRegistrationSchema.nullable(),
  candidate: desktopPushRegistrationSchema.nullable(),
})

type DesktopSnapshot = z.infer<typeof snapshotSchema>
async function invoke(action: 'session' | 'status' | 'request' | 'commit' | 'clear', payload: Record<string, unknown> = {}): Promise<DesktopSnapshot> {
  const native = desktopRuntime()
  if (!native) throw new Error('Desktop push runtime unavailable')
  return snapshotSchema.parse(await native.invoke('desktop_push', { action, ...payload }))
}

function preference(snapshot: DesktopSnapshot, accountId: string | null): PushPreferenceSnapshot {
  const subscribed = snapshot.permission === 'granted' && accountId !== null && snapshot.owner === accountId && snapshot.registration !== null
  return {
    supported: snapshot.supported, subscribed,
    permission: snapshot.permission === 'unsupported' ? '' : snapshot.permission,
    status: !snapshot.supported ? 'unsupported' : snapshot.permission === 'denied' ? 'denied' : subscribed ? 'registered' : 'not-registered',
  }
}

function subscription(registration: DesktopPushRegistration) {
  return {
    endpoint: registration.endpoint, keys: { p256dh: registration.p256dh, auth: registration.auth },
    apnsTopic: registration.apnsTopic, deviceId: registration.deviceId,
  }
}

export async function loadDesktopPush(accountId: string | null): Promise<PushPreferenceSnapshot> {
  try { return preference(await invoke('status'), accountId) } catch {
    return { supported: true, subscribed: false, permission: '', status: 'sync-failed' }
  }
}

export async function requestDesktopPushPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const snapshot = await invoke('request', { prompt: true })
  return !snapshot.supported ? 'unsupported' : snapshot.permission === 'granted' ? 'granted' : 'denied'
}

export async function ensureDesktopPush(accountId = getHeldAccountId(), prompt = true): Promise<PushPreferenceSnapshot> {
  const generation = getAccountGeneration()
  return serializePushSubscriptionMutation(async () => {
    assertAccount(accountId, generation)
    await invoke('session', { accountId })
    const snapshot = await invoke('request', { prompt })
    if (!snapshot.candidate || snapshot.permission !== 'granted') return preference(snapshot, accountId)
    assertAccount(accountId, generation)
    await subscribePush(subscription(snapshot.candidate), accountId)
    assertAccount(accountId, generation)
    return preference(await invoke('commit', { accountId, endpoint: snapshot.candidate.endpoint }), accountId)
  })
}

function assertAccount(accountId: string | null, generation: number): void {
  if (!accountId || accountId !== getHeldAccountId() || generation !== getAccountGeneration()) {
    throw Object.assign(new Error('Desktop push account changed'), { code: ACCOUNT_CHANGED_ERROR_CODE })
  }
}

export async function releaseDesktopPush(accountId: string | null): Promise<void> {
  if (!accountId) return
  await serializePushSubscriptionMutation(async () => {
    const snapshot = await invoke('status')
    if (snapshot.owner !== accountId || !snapshot.registration) return
    await unsubscribePushForCleanup(subscription(snapshot.registration), accountId)
    await invoke('clear', { accountId })
  })
}

export async function resumeDesktopPush(accountId: string | null): Promise<void> {
  await invoke('session', { accountId })
  if (!accountId) return
  const snapshot = await invoke('status')
  if (snapshot.owner && snapshot.owner !== accountId) {
    await serializePushSubscriptionMutation(async () => {
      const current = await invoke('status')
      if (current.owner === snapshot.owner) await invoke('clear', { accountId: snapshot.owner })
    })
    return
  }
  if (snapshot.owner === accountId && snapshot.registration) await ensureDesktopPush(accountId, false)
}

export async function desktopEndpoint(): Promise<string | null> {
  const snapshot = await invoke('status')
  return snapshot.owner === getHeldAccountId() ? snapshot.registration?.endpoint ?? null : null
}
