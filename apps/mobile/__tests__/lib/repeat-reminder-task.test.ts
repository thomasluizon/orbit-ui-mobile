import { beforeEach, expect, it, vi } from 'vitest'
import * as Notifications from 'expo-notifications'
import { apiClient } from '@/lib/api-client'
const tasks = vi.hoisted(() => ({ defineTask: vi.fn() }))
vi.mock('expo-task-manager', () => tasks)
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/i18n', () => ({ i18n: { t: (key: string) => key } }))
vi.mock('@sentry/react-native', () => ({ captureException: vi.fn() }))
beforeEach(() => { vi.clearAllMocks() })
it('registers the module-scoped Android task and updates the supplied action label before replacing the push', async () => {
  await import('@/lib/repeat-reminder-task')
  await Promise.resolve()
  expect(tasks.defineTask).toHaveBeenCalledWith('orbit-repeat-reminder-actions', expect.any(Function))
  expect(Notifications.registerTaskAsync).toHaveBeenCalledWith('orbit-repeat-reminder-actions')
  const execute = tasks.defineTask.mock.calls[0]![1]
  const payload = { tag: 'orbit-repeat-habit', title: 'Water', message: 'Next at 04:00', habitId: 'habit', doneToken: 'one-use', doneLabel: 'Concluir', reminderAtUtc: '2026-10-28T03:30:00Z', url: '/' }
  await execute({ data: { notification: null, data: payload } })
  expect(Notifications.setNotificationCategoryAsync).toHaveBeenLastCalledWith('orbit-repeat-reminder', [{ identifier: 'done', buttonTitle: 'Concluir', options: { opensAppToForeground: false } }])
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ identifier: payload.tag, content: expect.objectContaining({ categoryIdentifier: 'orbit-repeat-reminder', data: expect.objectContaining({ url: '/habits/habit' }) }) }))
  vi.mocked(Notifications.scheduleNotificationAsync).mockClear()
  await execute({ data: { actionIdentifier: 'done', notification: { request: { identifier: payload.tag, content: { dataString: JSON.stringify(payload) } } } } })
  expect(apiClient).toHaveBeenCalledTimes(1)
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
})
