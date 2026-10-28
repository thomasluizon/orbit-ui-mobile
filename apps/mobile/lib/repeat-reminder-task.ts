import { Platform } from 'react-native'
import * as TaskManager from 'expo-task-manager'
import * as Notifications from 'expo-notifications'
import * as Sentry from '@sentry/react-native'
import { handleRepeatReminderAction, registerRepeatReminderCategory } from './repeat-reminder-action'

const TASK_NAME = 'orbit-repeat-reminder-actions'

if (Platform.OS === 'android') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK_NAME, async ({ data, error }) => {
    if (error) { Sentry.captureException(error); return }
    if ('actionIdentifier' in data) {
      await handleRepeatReminderAction(data)
    } else if (typeof data.data.doneLabel === 'string') {
      await registerRepeatReminderCategory(data.data.doneLabel)
    }
  })
  void registerRepeatReminderCategory().then(() => Notifications.registerTaskAsync(TASK_NAME)).catch(Sentry.captureException)
}
