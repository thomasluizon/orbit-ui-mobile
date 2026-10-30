import { afterEach, expect, it, vi } from 'vitest'

const modules = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('@/lib/desktop-push', async importOriginal => {
  modules.push()
  return importOriginal()
})
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))

afterEach(() => vi.unstubAllGlobals())

it('imports native push only when a push preference action discovers the shell', async () => {
  const preferences = await import('@/hooks/use-push-notification-preferences')
  await import('@/hooks/use-push-subscriptions')
  await import('@/components/service-worker-bridge')
  Reflect.deleteProperty(globalThis, 'Notification')
  expect((await preferences.loadPushNotificationState(null)).status).toBe('unsupported')
  expect((await preferences.subscribeToPushNotifications()).status).toBe('unsupported')
  expect((await preferences.ensurePushSubscription()).status).toBe('unsupported')
  expect(await preferences.requestWebPushPermission()).toBe('unsupported')
  expect((await preferences.unsubscribeFromPushNotifications('')).status).toBe('unsupported')
  await preferences.releasePushSubscription(null)
  expect(modules.push).not.toHaveBeenCalled()

  const invoke = vi.fn(async () => ({
    supported: true, permission: 'granted', owner: null, registration: null, candidate: null, pending: [],
  }))
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  vi.stubGlobal('__ORBIT_DESKTOP_COMMANDS__', ['desktop_push'])
  expect(await preferences.requestWebPushPermission()).toBe('granted')
  expect(modules.push).toHaveBeenCalledOnce()
  expect(invoke).toHaveBeenCalledWith('desktop_push', { action: 'request', prompt: true })
  expect((await preferences.loadPushNotificationState(null)).status).toBe('not-registered')
})
