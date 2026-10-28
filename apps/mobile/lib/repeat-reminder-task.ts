import { z } from 'zod'
import { Platform } from 'react-native'
import * as TaskManager from 'expo-task-manager'
import * as Notifications from 'expo-notifications'
import * as Sentry from '@sentry/react-native'
import { handleRepeatReminderAction, registerRepeatReminderCategory, REPEAT_REMINDER_CATEGORY } from './repeat-reminder-action'

const TASK_NAME = 'orbit-repeat-reminder-actions'
const incomingRepeatSchema = z.object({ tag: z.string(), title: z.string(), message: z.string(), habitId: z.string(), doneToken: z.string(), doneLabel: z.string().optional() }).passthrough()

if (Platform.OS === 'android') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK_NAME, async ({ data, error }) => {
    if (error) { Sentry.captureException(error); return }
    if ('actionIdentifier' in data) {
      await handleRepeatReminderAction(data)
    } else {
      const parsed = incomingRepeatSchema.safeParse(data.data)
      if (!parsed.success) return
      const payload = parsed.data
      await registerRepeatReminderCategory(payload.doneLabel)
      await Notifications.scheduleNotificationAsync({ identifier: payload.tag, content: { title: payload.title, body: payload.message, data: { ...payload, url: `/habits/${encodeURIComponent(payload.habitId)}` }, categoryIdentifier: REPEAT_REMINDER_CATEGORY, sound: false }, trigger: null })
    }
  })
  void registerRepeatReminderCategory().then(() => Notifications.registerTaskAsync(TASK_NAME)).catch(Sentry.captureException)
}
