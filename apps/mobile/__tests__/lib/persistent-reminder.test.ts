import { beforeEach, describe, expect, it, vi } from 'vitest'
import expoNotificationsMock, {
  AndroidImportance,
  dismissNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  resetExpoNotificationsMocks,
  setNotificationChannelAsync,
} from '@/test-mocks/expo-notifications'
import { i18n } from '@/lib/i18n'
import {
  __setPersistentReminderModuleForTests,
  __setPersistentReminderNativeModuleForTests,
  buildReminderContent,
  cancelPersistentReminder,
  extractReminderFeed,
  isPersistentReminderSupported,
  refreshPersistentReminder,
  requestPersistentReminderPermission,
} from '@/lib/persistent-reminder'
import { usePersistentReminderStore } from '@/stores/persistent-reminder-store'
import type { OrbitWidgetModuleType } from '../../modules/orbit-widget/src/OrbitWidget.types'

const secureStoreMocks = vi.hoisted(() => ({ getToken: vi.fn() }))
vi.mock('@/lib/secure-store', () => ({ getToken: secureStoreMocks.getToken }))

const postPersistentReminder = vi.fn(async (
  _generation: number, _title: string, _body: string, _color: string,
) => {})
const cancelNativeReminder = vi.fn(async (_generation: number) => {})
const nativeModule: OrbitWidgetModuleType = {
  saveToken: vi.fn(),
  clearToken: vi.fn(),
  syncTheme: vi.fn(),
  syncWidgetData: vi.fn(),
  postPersistentReminder,
  cancelPersistentReminder: cancelNativeReminder,
}

/** Compact JWS, exactly as the API emits it: base64url, padding stripped. */
function tokenFor(accountId: string, email = `${accountId}@example.com`): string {
  const payload = btoa(JSON.stringify({ sub: accountId, email }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return `header.${payload}.signature`
}

const OWNER_TOKEN = tokenFor('owner-account')
const PERSISTENT_REMINDER_IDENTIFIER = 'orbit-persistent-reminder'

const fakeTranslate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

describe('persistent reminder', () => {
  beforeEach(async () => {
    resetExpoNotificationsMocks()
    secureStoreMocks.getToken.mockReset()
    secureStoreMocks.getToken.mockResolvedValue(OWNER_TOKEN)
    __setPersistentReminderModuleForTests(expoNotificationsMock)
    __setPersistentReminderNativeModuleForTests(nativeModule)
    postPersistentReminder.mockReset()
    postPersistentReminder.mockResolvedValue(undefined)
    cancelNativeReminder.mockReset()
    cancelNativeReminder.mockResolvedValue(undefined)
    usePersistentReminderStore.setState({ enabled: false })
    await i18n.changeLanguage('en')
  })

  describe('extractReminderFeed', () => {
    it('counts each sub-habit individually so the total matches the Today list', () => {
      const feed = extractReminderFeed({
        currentStreak: 12,
        items: [
          { isCompleted: true, children: [] },
          { isCompleted: false, children: [{ isCompleted: true }, { isCompleted: true }] },
          { isCompleted: false, children: [{ isCompleted: true }, { isCompleted: false }] },
          { isCompleted: false },
        ],
      })

      expect(feed).toEqual({ streak: 12, completed: 4, total: 6 })
    })

    it('defaults the streak to zero and rejects non-feed payloads', () => {
      expect(extractReminderFeed({ items: [] })).toEqual({ streak: 0, completed: 0, total: 0 })
      expect(extractReminderFeed(null)).toBeNull()
      expect(extractReminderFeed('not-a-feed')).toBeNull()
    })
  })

  describe('buildReminderContent', () => {
    it('uses the streak title and progress body when both are present', () => {
      expect(buildReminderContent({ streak: 12, completed: 3, total: 5 }, fakeTranslate)).toEqual({
        title: 'persistentReminder.titleStreak:{"streak":12}',
        body: 'persistentReminder.body:{"completed":3,"total":5}',
      })
    })

    it('falls back when there is no streak and nothing scheduled', () => {
      expect(buildReminderContent({ streak: 0, completed: 0, total: 0 }, fakeTranslate)).toEqual({
        title: 'persistentReminder.titleNoStreak',
        body: 'persistentReminder.bodyEmpty',
      })
    })
  })

  describe('refreshPersistentReminder', () => {
    it('posts nothing while the toggle is off', async () => {
      await refreshPersistentReminder(
        { currentStreak: 5, items: [{ isCompleted: true }] },
        OWNER_TOKEN,
      )
      expect(postPersistentReminder).not.toHaveBeenCalled()
    })

    it('posts a quiet ongoing notification with the feed streak and progress when on', async () => {
      usePersistentReminderStore.setState({ enabled: true })

      await refreshPersistentReminder(
        {
          currentStreak: 12,
          items: [
            { isCompleted: true },
            { isCompleted: true },
            { isCompleted: true },
            { isCompleted: false },
            { isCompleted: false },
          ],
        },
        OWNER_TOKEN,
      )

      expect(postPersistentReminder).toHaveBeenCalledTimes(1)
      expect(setNotificationChannelAsync).toHaveBeenCalledWith(
        'persistent-reminder',
        expect.objectContaining({ importance: AndroidImportance.LOW }),
      )

      expect(postPersistentReminder).toHaveBeenCalledWith(
        expect.any(Number), '12-day streak', '3/5 done today', expect.any(String),
      )
    })

    it('re-posts in place with the same identifier when the feed updates', async () => {
      usePersistentReminderStore.setState({ enabled: true })

      await refreshPersistentReminder(
        { currentStreak: 1, items: [{ isCompleted: false }] },
        OWNER_TOKEN,
      )
      await refreshPersistentReminder(
        { currentStreak: 2, items: [{ isCompleted: true }] },
        OWNER_TOKEN,
      )

      const calls = postPersistentReminder.mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0]?.[2]).toBe('0/1 done today')
      expect(calls[1]?.[2]).toBe('1/1 done today')
    })

    it('dismisses the notification when the feed is unavailable while enabled', async () => {
      usePersistentReminderStore.setState({ enabled: true })

      await refreshPersistentReminder(null, null)

      expect(dismissNotificationAsync).toHaveBeenCalledWith('orbit-persistent-reminder')
      expect(postPersistentReminder).not.toHaveBeenCalled()
      expect(cancelNativeReminder).toHaveBeenCalledTimes(1)
    })

    it('does not update after the feed resolves under a different signed-in account', async () => {
      usePersistentReminderStore.setState({ enabled: true })
      const authorizingToken = tokenFor('first-account')
      secureStoreMocks.getToken.mockResolvedValue(tokenFor('second-account'))

      await refreshPersistentReminder(
        { currentStreak: 8, items: [{ isCompleted: true }] },
        authorizingToken,
      )

      expect(postPersistentReminder).not.toHaveBeenCalled()
    })

    it('reads an account from a payload whose base64url carries - or _', async () => {
      usePersistentReminderStore.setState({ enabled: true })
      const authorizingToken = tokenFor('first-account', 'abc?@example.com')
      expect(authorizingToken.split('.')[1]).toMatch(/[-_]/)
      secureStoreMocks.getToken.mockResolvedValue(authorizingToken)

      await refreshPersistentReminder(
        { currentStreak: 8, items: [{ isCompleted: true }] },
        authorizingToken,
      )

      expect(postPersistentReminder).toHaveBeenCalledTimes(1)
    })

    it('dismisses again when cancellation starts while native scheduling is in flight', async () => {
      usePersistentReminderStore.setState({ enabled: true })
      const authorizingToken = tokenFor('first-account')
      secureStoreMocks.getToken.mockResolvedValue(authorizingToken)

      let releasePresentation: () => void = () => {}
      const displayed = new Set<string>()
      let cancelledAtGeneration = -1
      const presentationPending = new Promise<void>((resolve) => {
        releasePresentation = resolve
      })
      postPersistentReminder.mockImplementationOnce(async (generation) => {
        await presentationPending
        if (generation >= cancelledAtGeneration) {
          displayed.add(PERSISTENT_REMINDER_IDENTIFIER)
        }
      })
      cancelNativeReminder.mockImplementation((generation) => {
        cancelledAtGeneration = generation
        displayed.clear()
        return Promise.resolve()
      })
      dismissNotificationAsync.mockImplementation((identifier) => {
        displayed.delete(identifier)
        return Promise.resolve()
      })

      const refreshing = refreshPersistentReminder(
        { currentStreak: 8, items: [{ isCompleted: true }] },
        authorizingToken,
      )
      await vi.waitFor(() => expect(postPersistentReminder).toHaveBeenCalled())

      await cancelPersistentReminder()
      expect(cancelNativeReminder).toHaveBeenCalledTimes(1)
      expect(dismissNotificationAsync).toHaveBeenCalledTimes(1)
      releasePresentation()
      await refreshing

      expect(displayed).not.toContain(PERSISTENT_REMINDER_IDENTIFIER)
    })

    it('does not post when the reminder is cancelled during channel setup, same account', async () => {
      usePersistentReminderStore.setState({ enabled: true })
      secureStoreMocks.getToken.mockResolvedValue(OWNER_TOKEN)

      let releaseChannel: () => void = () => {}
      const channelPending = new Promise<void>((resolve) => {
        releaseChannel = resolve
      })
      setNotificationChannelAsync.mockImplementationOnce(async () => {
        await channelPending
      })

      const refreshing = refreshPersistentReminder(
        { currentStreak: 8, items: [{ isCompleted: true }] },
        OWNER_TOKEN,
      )
      await vi.waitFor(() => expect(setNotificationChannelAsync).toHaveBeenCalled())

      await cancelPersistentReminder()
      releaseChannel()
      await refreshing

      expect(postPersistentReminder).not.toHaveBeenCalled()
    })

    it('does not post when the payload carries no account to attribute it to', async () => {
      usePersistentReminderStore.setState({ enabled: true })

      await refreshPersistentReminder({ currentStreak: 8, items: [{ isCompleted: true }] }, null)

      expect(postPersistentReminder).not.toHaveBeenCalled()
    })

    it('does not post when the account changes while channel setup is still pending', async () => {
      usePersistentReminderStore.setState({ enabled: true })
      const authorizingToken = tokenFor('first-account')
      let signedInToken = authorizingToken
      secureStoreMocks.getToken.mockImplementation(() => Promise.resolve(signedInToken))

      let releaseChannel: () => void = () => {}
      const channelPending = new Promise<void>((resolve) => {
        releaseChannel = resolve
      })
      setNotificationChannelAsync.mockImplementationOnce(async () => {
        await channelPending
      })

      const refreshing = refreshPersistentReminder(
        { currentStreak: 8, items: [{ isCompleted: true }] },
        authorizingToken,
      )

      await vi.waitFor(() => expect(setNotificationChannelAsync).toHaveBeenCalled())

      signedInToken = tokenFor('second-account')
      await cancelPersistentReminder()
      releaseChannel()
      await refreshing

      expect(postPersistentReminder).not.toHaveBeenCalled()
      expect(dismissNotificationAsync).toHaveBeenCalledWith('orbit-persistent-reminder')
    })
  })

  describe('cancelPersistentReminder', () => {
    it('dismisses the ongoing notification', async () => {
      await cancelPersistentReminder()
      expect(dismissNotificationAsync).toHaveBeenCalledWith('orbit-persistent-reminder')
      expect(cancelNativeReminder).toHaveBeenCalledTimes(1)
    })
  })

  describe('requestPersistentReminderPermission', () => {
    it('prompts and resolves true once permission is granted', async () => {
      await expect(requestPersistentReminderPermission()).resolves.toBe(true)
      expect(requestPermissionsAsync).toHaveBeenCalled()
    })

    it('resolves false when permission stays blocked', async () => {
      getPermissionsAsync.mockResolvedValue({
        status: 'denied',
        granted: false,
        canAskAgain: false,
      })

      await expect(requestPersistentReminderPermission()).resolves.toBe(false)
      expect(requestPermissionsAsync).not.toHaveBeenCalled()
    })

    it('resolves false when the notifications module throws while checking permission', async () => {
      getPermissionsAsync.mockRejectedValueOnce(new Error('permissions unavailable'))

      await expect(requestPersistentReminderPermission()).resolves.toBe(false)
    })
  })

  describe('isPersistentReminderSupported', () => {
    it('is supported while a notifications module is present', () => {
      expect(isPersistentReminderSupported()).toBe(true)
    })

    it('is unsupported once the notifications module is unavailable', () => {
      __setPersistentReminderModuleForTests(null)

      expect(isPersistentReminderSupported()).toBe(false)
    })

    it('is unsupported once the native presentation module is unavailable', () => {
      __setPersistentReminderNativeModuleForTests(null)

      expect(isPersistentReminderSupported()).toBe(false)
    })
  })
})
