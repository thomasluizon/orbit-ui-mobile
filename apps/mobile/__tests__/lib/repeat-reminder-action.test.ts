import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { apiClient } from '@/lib/api-client'
import { handleRepeatReminderAction, registerRepeatReminderCategory } from '@/lib/repeat-reminder-action'

vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/i18n', () => ({ i18n: { t: (key: string) => key } }))
const request = { identifier: 'reminder-1', content: { data: { habitId: 'habit-1', reminderAtUtc: '2026-10-28T03:30:00Z', doneToken: 'one-use', doneLabel: 'Concluir', url: '/habits/habit-1' } } }
beforeEach(async () => { vi.clearAllMocks(); await AsyncStorage.clear() })
describe('repeat notification Done', () => {
  it('registers the supplied label without foregrounding', async () => {
    await registerRepeatReminderCategory('Concluir')
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('orbit-repeat-reminder', [{ identifier: 'done', buttonTitle: 'Concluir', options: { opensAppToForeground: false } }])
  })
  it('calls the endpoint once for a repeated response and posts nothing on success', async () => {
    vi.mocked(apiClient).mockResolvedValue({ logId: 'log-1' })
    const response = { actionIdentifier: 'done', notification: { request } }
    await Promise.all([handleRepeatReminderAction(response), handleRepeatReminderAction(response)])
    expect(apiClient).toHaveBeenCalledExactlyOnceWith('/api/reminders/done', expect.objectContaining({ method: 'POST', anonymous: true, body: JSON.stringify({ token: 'one-use' }) }))
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
  it.each(['expired', 'offline'])('replaces the original with one actionless detail notification after %s', async (failure) => {
    vi.mocked(apiClient).mockRejectedValue(new Error(failure))
    await handleRepeatReminderAction({ actionIdentifier: 'done', notification: { request: { ...request, identifier: failure, content: { data: { ...request.content.data, reminderAtUtc: failure } } } } })
    expect(apiClient).toHaveBeenCalledTimes(1)
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledExactlyOnceWith({ identifier: failure, content: { title: 'habits.repeatRecoveryTitle', body: 'habits.repeatRecoveryBody', data: { url: '/habits/habit-1', reminderAtUtc: failure } }, trigger: null })
  })
  it('leaves notification body taps to the detail router', async () => {
    expect(await handleRepeatReminderAction({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { request } })).toBe(false)
    expect(apiClient).not.toHaveBeenCalled()
  })
})
