import { beforeEach, describe, expect, it, vi } from 'vitest'

import expoNotificationsMock, {
  dismissNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  resetExpoNotificationsMocks,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from '@/test-mocks/expo-notifications'
import { i18n } from '@/lib/i18n'
import {
  __setPersistentReminderModuleForTests,
  buildReminderContent,
  cancelPersistentReminder,
  extractReminderFeed,
  refreshPersistentReminder,
  requestPersistentReminderPermission,
} from '@/lib/persistent-reminder'
import { usePersistentReminderStore } from '@/stores/persistent-reminder-store'

interface ScheduledRequest {
  identifier?: string
  content: {
    title: string
    body: string
    sticky: boolean
    autoDismiss: boolean
    color: string
    data: { url: string }
  }
  trigger: { channelId: string } | null
}

function lastScheduledRequest(): ScheduledRequest {
  const calls = scheduleNotificationAsync.mock.calls
  const lastCall = calls[calls.length - 1]
  if (!lastCall) throw new Error('expected a scheduled notification')
  return lastCall[0] as ScheduledRequest
}

const fakeTranslate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

describe('persistent reminder', () => {
  beforeEach(async () => {
    resetExpoNotificationsMocks()
    __setPersistentReminderModuleForTests(expoNotificationsMock)
    usePersistentReminderStore.setState({ enabled: false })
    await i18n.changeLanguage('en')
  })

  describe('extractReminderFeed', () => {
    it('projects streak and top-level progress, mirroring the widget math', () => {
      const feed = extractReminderFeed({
        currentStreak: 12,
        items: [
          { isCompleted: true, children: [] },
          { isCompleted: false, children: [{ isCompleted: true }, { isCompleted: true }] },
          { isCompleted: false, children: [{ isCompleted: false }] },
          { isCompleted: false, children: [] },
          { isCompleted: false },
        ],
      })

      expect(feed).toEqual({ streak: 12, completed: 2, total: 5 })
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
      await refreshPersistentReminder({ currentStreak: 5, items: [{ isCompleted: true }] })
      expect(scheduleNotificationAsync).not.toHaveBeenCalled()
    })

    it('posts a quiet ongoing notification with the feed streak and progress when on', async () => {
      usePersistentReminderStore.setState({ enabled: true })

      await refreshPersistentReminder({
        currentStreak: 12,
        items: [
          { isCompleted: true },
          { isCompleted: true },
          { isCompleted: true },
          { isCompleted: false },
          { isCompleted: false },
        ],
      })

      expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1)
      expect(setNotificationChannelAsync).toHaveBeenCalledWith(
        'persistent-reminder',
        expect.objectContaining({ importance: expoNotificationsMock.AndroidImportance.LOW }),
      )

      const request = lastScheduledRequest()
      expect(request.identifier).toBe('orbit-persistent-reminder')
      expect(request.content.title).toBe('12-day streak')
      expect(request.content.body).toBe('3/5 done today')
      expect(request.content.sticky).toBe(true)
      expect(request.content.autoDismiss).toBe(false)
      expect(request.content.data).toEqual({ url: '/' })
      expect(request.trigger).toEqual({ channelId: 'persistent-reminder' })
    })

    it('re-posts in place with the same identifier when the feed updates', async () => {
      usePersistentReminderStore.setState({ enabled: true })

      await refreshPersistentReminder({ currentStreak: 1, items: [{ isCompleted: false }] })
      await refreshPersistentReminder({ currentStreak: 2, items: [{ isCompleted: true }] })

      const calls = scheduleNotificationAsync.mock.calls
      expect(calls).toHaveLength(2)
      const first = calls[0]?.[0] as ScheduledRequest | undefined
      const second = calls[1]?.[0] as ScheduledRequest | undefined
      expect(first?.identifier).toBe('orbit-persistent-reminder')
      expect(first?.content.body).toBe('0/1 done today')
      expect(second?.identifier).toBe('orbit-persistent-reminder')
      expect(second?.content.body).toBe('1/1 done today')
    })

    it('dismisses the notification when the feed is unavailable while enabled', async () => {
      usePersistentReminderStore.setState({ enabled: true })

      await refreshPersistentReminder(null)

      expect(dismissNotificationAsync).toHaveBeenCalledWith('orbit-persistent-reminder')
      expect(scheduleNotificationAsync).not.toHaveBeenCalled()
    })
  })

  describe('cancelPersistentReminder', () => {
    it('dismisses the ongoing notification', async () => {
      await cancelPersistentReminder()
      expect(dismissNotificationAsync).toHaveBeenCalledWith('orbit-persistent-reminder')
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
  })
})
