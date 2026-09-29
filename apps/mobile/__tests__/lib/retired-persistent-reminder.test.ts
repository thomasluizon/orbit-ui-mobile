import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteNotificationChannelAsync,
  dismissNotificationAsync,
  resetExpoNotificationsMocks,
} from '@/test-mocks/expo-notifications'
import { captureError } from '@/lib/sentry'
import { retirePersistentReminder } from '@/lib/retired-persistent-reminder'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

describe('retirePersistentReminder', () => {
  beforeEach(() => {
    resetExpoNotificationsMocks()
    vi.restoreAllMocks()
    vi.mocked(captureError).mockClear()
  })

  it('cancels the ongoing notification, deletes its channel and forgets the stored switch', async () => {
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem')

    await retirePersistentReminder()

    expect(dismissNotificationAsync).toHaveBeenCalledExactlyOnceWith('orbit-persistent-reminder')
    expect(deleteNotificationChannelAsync).toHaveBeenCalledExactlyOnceWith('persistent-reminder')
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('orbit-persistent-reminder')
    expect(captureError).not.toHaveBeenCalled()
  })

  it('still deletes the channel and the stored switch when the dismissal fails, and reports it', async () => {
    const dismissFailure = new Error('notification service unavailable')
    dismissNotificationAsync.mockRejectedValueOnce(dismissFailure)
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem')

    await retirePersistentReminder()

    expect(deleteNotificationChannelAsync).toHaveBeenCalledExactlyOnceWith('persistent-reminder')
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('orbit-persistent-reminder')
    expect(captureError).toHaveBeenCalledExactlyOnceWith(dismissFailure)
  })
})
