import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { z } from 'zod'
import { API } from '@orbit/shared/api'
import { apiClient } from './api-client'
import { i18n } from './i18n'

export const REPEAT_REMINDER_CATEGORY = 'orbit-repeat-reminder'
const pendingActions = new Map<string, Promise<void>>()
const responseSchema = z.object({
  actionIdentifier: z.string(),
  notification: z.object({ request: z.object({
    identifier: z.string(),
    content: z.object({ data: z.record(z.string(), z.unknown()).optional(), dataString: z.string().optional() }),
  }) }),
})
const actionPayloadSchema = z.object({ habitId: z.string(), reminderAtUtc: z.string(), doneToken: z.string().optional() })

export function registerRepeatReminderCategory(doneLabel?: string) {
  return Notifications.setNotificationCategoryAsync(REPEAT_REMINDER_CATEGORY, [{
    identifier: 'done', buttonTitle: doneLabel || i18n.t('common.done'), options: { opensAppToForeground: false },
  }])
}

async function completeRepeatReminder(identifier: string, payload: z.infer<typeof actionPayloadSchema>) {
  const storageKey = `repeat-reminder-action:${payload.habitId}`
  if (await AsyncStorage.getItem(storageKey) === payload.reminderAtUtc) return
  await AsyncStorage.setItem(storageKey, payload.reminderAtUtc)
  try {
    if (!payload.doneToken) throw new Error('Missing reminder action token')
    await apiClient(API.reminders.done, { method: 'POST', body: JSON.stringify({ token: payload.doneToken }), anonymous: true, silent: true })
  } catch {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: i18n.t('habits.repeatRecoveryTitle'), body: i18n.t('habits.repeatRecoveryBody'), data: { url: `/habits/${payload.habitId}` } },
      trigger: null,
    })
  }
}

export async function handleRepeatReminderAction(response: unknown): Promise<boolean> {
  const parsed = responseSchema.safeParse(response)
  if (!parsed.success || parsed.data.actionIdentifier !== 'done') return false
  const { identifier, content } = parsed.data.notification.request
  const payload = actionPayloadSchema.parse(content.data ?? JSON.parse(content.dataString ?? '{}'))
  const key = `${payload.habitId}:${payload.reminderAtUtc}`
  let pending = pendingActions.get(key)
  if (!pending) {
    pending = completeRepeatReminder(identifier, payload)
    pendingActions.set(key, pending)
    if (pendingActions.size > 200) pendingActions.delete(pendingActions.keys().next().value!)
  }
  await pending
  return true
}
