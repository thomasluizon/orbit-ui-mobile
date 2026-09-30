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
  const { useAuthStore, seedRenderedAccount } = await import('@/stores/auth-store')
  const { setAccountId } = await import('@/lib/account-scope')
  const { recordPushSubscriptionOwner } = await import('@/lib/push-subscription-owner')
  const { setApiFetchTranslate } = await import('@/lib/api-fetch')
  setApiFetchTranslate((key) => `translated:${key}`)
  seedRenderedAccount('account-a')
  useAuthStore.setState({ isAuthenticated: true })
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
    void serializePushSubscriptionMutation(() => unsubscribePush(subscription.toJSON(), 'account-a'))
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

  it('preserves another tab claim made while release waits for the origin push lock', async () => {
    const { useAuthStore, subscription } = await installSignedInBrowser()
    await import('@/hooks/use-push-notification-preferences')
    vi.resetModules()
    const otherTab = await import('@/lib/push-subscription-owner')
    let finishClaim: () => void = () => undefined
    const claiming = otherTab.serializePushSubscriptionMutation(async () => {
      await new Promise<void>((resolve) => { finishClaim = resolve })
      otherTab.recordPushSubscriptionOwner('account-b')
    })
    const signedOut = useAuthStore.getState().logout()
    await new Promise((resolve) => setTimeout(resolve, 0))
    finishClaim()

    await settleWithin(Promise.all([claiming, signedOut]))
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(otherTab.isPushSubscriptionOwner('account-b')).toBe(true)
  })

  it('ends the matching account endpoint after a genuine network failure through the real wrapper', async () => {
    const { useAuthStore, subscription } = await installSignedInBrowser()
    actions.unsubscribePush.mockRejectedValue(new TypeError('Failed to fetch'))

    await settleWithin(useAuthStore.getState().logout())
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('settles a pending release and ends the matching endpoint without waiting for late completion', async () => {
    const { useAuthStore, subscription } = await installSignedInBrowser()
    await import('@/hooks/use-push-notification-preferences')
    const { wrapServerAction } = await import('@/app/actions/action-result')
    let finishRelease: () => void = () => undefined
    actions.unsubscribePush.mockImplementation(() => wrapServerAction(() => new Promise<void>((resolve) => { finishRelease = resolve })))
    vi.useFakeTimers()
    const signedOut = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(actions.unsubscribePush).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(5000)
    await signedOut
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    finishRelease()
    await vi.advanceTimersByTimeAsync(0)

    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    const { withSessionCookieLock } = await import('@/lib/session-cookie-lock')
    expect(await withSessionCookieLock(async () => 'cookies available')).toBe('cookies available')
  })
})
