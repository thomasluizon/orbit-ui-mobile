import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteNotificationChannelAsync,
  dismissNotificationAsync,
  resetExpoNotificationsMocks,
} from '@/test-mocks/expo-notifications'
import { retirePersistentReminder } from '@/lib/retired-persistent-reminder'

describe('retirePersistentReminder', () => {
  beforeEach(() => {
    resetExpoNotificationsMocks()
    vi.restoreAllMocks()
  })

  it('cancels the ongoing notification, deletes its channel and forgets the stored switch', async () => {
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem')

    await retirePersistentReminder()

    expect(dismissNotificationAsync).toHaveBeenCalledExactlyOnceWith('orbit-persistent-reminder')
    expect(deleteNotificationChannelAsync).toHaveBeenCalledExactlyOnceWith('persistent-reminder')
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('orbit-persistent-reminder')
  })
})
