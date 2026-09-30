import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { createApiClientError } from '@orbit/shared'
import { installWebLocks } from '../helpers/web-locks'

const actions = vi.hoisted(() => ({ subscribePush: vi.fn(), unsubscribePush: vi.fn() }))
vi.mock('@/app/actions/notifications', () => ({
  ...actions,
  markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(), deleteAllNotifications: vi.fn(),
}))
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

async function settleWithin<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Sign-out or cookie lock still pending')), 6500)
    })])
  } finally { clearTimeout(timer) }
}

async function installSignedInBrowser() {
  const { useAuthStore } = await import('@/stores/auth-store')
  const { setAccountId } = await import('@/lib/account-scope')
  const { recordPushSubscriptionOwner } = await import('@/lib/push-subscription-owner')
  const { setApiFetchTranslate } = await import('@/lib/api-fetch')
  setApiFetchTranslate((key) => `translated:${key}`)
  useAuthStore.setState({ isAuthenticated: true, heldAccountId: 'account-a' })
  setAccountId('account-a')
  recordPushSubscriptionOwner('account-a')
  const subscription = {
    endpoint: 'https://push.example.com/browser',
    toJSON: () => ({ endpoint: 'https://push.example.com/browser', expirationTime: null, keys: { p256dh: 'device-key', auth: 'device-auth' } }),
    unsubscribe: vi.fn(async () => true),
  }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    getRegistration: vi.fn(async () => ({ pushManager: { getSubscription: async () => subscription } })),
  } })
  return { useAuthStore, subscription, recordPushSubscriptionOwner }
}

describe('sign-out through the real notifications action wrapper', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    installWebLocks()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    vi.stubGlobal('location', { href: '/', reload: vi.fn() })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('settles sign-out and the next cookie operation after an unrecognized action with translations installed', async () => {
    const { useAuthStore, subscription } = await installSignedInBrowser()
    actions.unsubscribePush.mockRejectedValue(new UnrecognizedActionError('Unknown action'))
    const { withSessionCookieLock } = await import('@/lib/session-cookie-lock')
    const signedOut = useAuthStore.getState().logout()
    const followingCookieOperation = withSessionCookieLock(async () => 'cookies available')

    await settleWithin(signedOut)
    expect(await settleWithin(followingCookieOperation)).toBe('cookies available')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  })

  it('settles sign-out behind a predecessor stuck in the real reload-guidance wrapper', async () => {
    const { useAuthStore, subscription } = await installSignedInBrowser()
    const { serializePushSubscriptionMutation } = await import('@/lib/push-subscription-owner')
    const { unsubscribePush } = await import('@/lib/actions/notifications')
    actions.unsubscribePush.mockRejectedValue(new UnrecognizedActionError('Unknown action'))
    void serializePushSubscriptionMutation(() => unsubscribePush(subscription.toJSON()))
    await vi.waitFor(() => expect(actions.unsubscribePush).toHaveBeenCalledOnce())
    const { withSessionCookieLock } = await import('@/lib/session-cookie-lock')

    await settleWithin(useAuthStore.getState().logout())
    expect(await settleWithin(withSessionCookieLock(async () => 'cookies available'))).toBe('cookies available')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('keeps the replacement account endpoint when a stale held account signs out', async () => {
    const { useAuthStore, subscription, recordPushSubscriptionOwner } = await installSignedInBrowser()
    recordPushSubscriptionOwner('account-b')
    const { wrapServerAction } = await import('@/app/actions/action-result')
    actions.unsubscribePush.mockImplementation(() => wrapServerAction(async () => {
      throw createApiClientError(409, { error: 'Account changed', errorCode: 'ACCOUNT_CHANGED' }, 'Account changed')
    }))

    await settleWithin(useAuthStore.getState().logout())
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('keeps the browser endpoint on account refusal even if the owner marker still matches the stale account', async () => {
    const { useAuthStore, subscription } = await installSignedInBrowser()
    const { wrapServerAction } = await import('@/app/actions/action-result')
    actions.unsubscribePush.mockImplementation(() => wrapServerAction(async () => {
      throw createApiClientError(409, { error: 'Account changed', errorCode: 'ACCOUNT_CHANGED' }, 'Account changed')
    }))

    await settleWithin(useAuthStore.getState().logout())
    expect(actions.unsubscribePush).toHaveBeenCalledOnce()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
