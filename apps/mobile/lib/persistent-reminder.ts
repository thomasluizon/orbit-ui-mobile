import { Platform } from 'react-native'
import { schemes } from '@orbit/shared/theme'
import { i18n } from '@/lib/i18n'
import {
  normalizePermissionStatus,
  type NotificationPermissionsResponse,
} from '@/lib/push-notification-permissions'
import { usePersistentReminderStore } from '@/stores/persistent-reminder-store'

const PERSISTENT_REMINDER_ID = 'orbit-persistent-reminder'
const PERSISTENT_REMINDER_CHANNEL_ID = 'persistent-reminder'
const TODAY_DEEP_LINK = '/'

/** Streak and today's progress projected from the same widget feed payload. */
export interface ReminderFeed {
  streak: number
  completed: number
  total: number
}

interface ReminderContent {
  title: string
  body: string
  sticky: boolean
  autoDismiss: boolean
  color: string
  data: { url: string }
}

interface PersistentReminderNotificationsModule {
  AndroidImportance: { LOW: number }
  setNotificationChannelAsync: (
    channelId: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>
  scheduleNotificationAsync: (request: {
    identifier?: string
    content: ReminderContent
    trigger: { channelId: string } | null
  }) => Promise<string>
  dismissNotificationAsync: (identifier: string) => Promise<void>
  getPermissionsAsync: () => Promise<NotificationPermissionsResponse>
  requestPermissionsAsync: () => Promise<NotificationPermissionsResponse>
}

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

declare const require: (id: string) => unknown

function hasFunctionProperty(value: object, key: string): boolean {
  return key in value && typeof Reflect.get(value, key) === 'function'
}

function isNotificationsModule(
  value: unknown,
): value is PersistentReminderNotificationsModule {
  if (!value || typeof value !== 'object') return false

  return (
    hasFunctionProperty(value, 'setNotificationChannelAsync') &&
    hasFunctionProperty(value, 'scheduleNotificationAsync') &&
    hasFunctionProperty(value, 'dismissNotificationAsync') &&
    hasFunctionProperty(value, 'getPermissionsAsync') &&
    hasFunctionProperty(value, 'requestPermissionsAsync') &&
    'AndroidImportance' in value
  )
}

function loadNotificationsModule(): PersistentReminderNotificationsModule | null {
  try {
    const required = require('expo-notifications')
    if (isNotificationsModule(required)) return required

    if (required && typeof required === 'object' && 'default' in required) {
      const defaultExport = Reflect.get(required, 'default')
      if (isNotificationsModule(defaultExport)) return defaultExport
    }

    return null
  } catch {
    return null
  }
}

let notificationsModule: PersistentReminderNotificationsModule | null =
  loadNotificationsModule()

export function __setPersistentReminderModuleForTests(nextModule: unknown): void {
  notificationsModule = isNotificationsModule(nextModule) ? nextModule : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCompletedItem(value: unknown): boolean {
  return isRecord(value) && value.isCompleted === true
}

/**
 * Projects the widget feed payload into the streak + today's progress the
 * reminder displays. Counts each sub-habit as its own item — a parent with
 * children contributes its children (Orbit treats the parent as a container
 * done when its children are), a childless habit counts as one — so the total
 * matches the Today list. Returns null when the payload is not a feed object.
 */
export function extractReminderFeed(data: unknown): ReminderFeed | null {
  if (!isRecord(data)) return null

  const rawItems = data.items
  const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : []
  const streak = typeof data.currentStreak === 'number' ? data.currentStreak : 0

  let total = 0
  let completed = 0
  for (const item of items) {
    const children = Array.isArray(item.children) ? item.children.filter(isRecord) : []
    if (children.length > 0) {
      total += children.length
      completed += children.filter(isCompletedItem).length
    } else {
      total += 1
      if (item.isCompleted === true) completed += 1
    }
  }

  return { streak, completed, total }
}

/**
 * Builds the ongoing notification's title and body from the feed numbers. The
 * title carries the streak (or a start-a-streak nudge at zero); the body carries
 * today's progress (or an all-clear line when nothing is scheduled).
 */
export function buildReminderContent(
  feed: ReminderFeed,
  t: TranslationFn,
): { title: string; body: string } {
  const title =
    feed.streak > 0
      ? t('persistentReminder.titleStreak', { streak: feed.streak })
      : t('persistentReminder.titleNoStreak')
  const body =
    feed.total > 0
      ? t('persistentReminder.body', { completed: feed.completed, total: feed.total })
      : t('persistentReminder.bodyEmpty')

  return { title, body }
}

async function ensureChannel(
  activeModule: PersistentReminderNotificationsModule,
): Promise<void> {
  await activeModule.setNotificationChannelAsync(PERSISTENT_REMINDER_CHANNEL_ID, {
    name: i18n.t('persistentReminder.channelName'),
    importance: activeModule.AndroidImportance.LOW,
    showBadge: false,
  })
}

async function postReminder(
  activeModule: PersistentReminderNotificationsModule,
  feed: ReminderFeed,
): Promise<void> {
  await ensureChannel(activeModule)
  const { title, body } = buildReminderContent(feed, (key, params) => i18n.t(key, params))
  await activeModule.scheduleNotificationAsync({
    identifier: PERSISTENT_REMINDER_ID,
    content: {
      title,
      body,
      sticky: true,
      autoDismiss: false,
      color: schemes.purple.accent.dark.primary,
      data: { url: TODAY_DEEP_LINK },
    },
    trigger: { channelId: PERSISTENT_REMINDER_CHANNEL_ID },
  })
}

/** True when the ongoing reminder can run on this device (Android + module present). */
export function isPersistentReminderSupported(): boolean {
  return notificationsModule !== null && Platform.OS === 'android'
}

/**
 * Ensures notification permission for the ongoing reminder, prompting once when
 * still undetermined. Returns whether the OS will display the notification.
 */
export async function requestPersistentReminderPermission(): Promise<boolean> {
  const activeModule = notificationsModule
  if (!activeModule || Platform.OS !== 'android') return false

  try {
    await ensureChannel(activeModule)
    let permissions = await activeModule.getPermissionsAsync()
    let status = normalizePermissionStatus(permissions)

    if (status !== 'granted' && permissions.canAskAgain !== false) {
      permissions = await activeModule.requestPermissionsAsync()
      status = normalizePermissionStatus(permissions)
    }

    return status === 'granted'
  } catch {
    return false
  }
}

/** Removes the ongoing reminder from the tray. */
export async function cancelPersistentReminder(): Promise<void> {
  const activeModule = notificationsModule
  if (!activeModule || Platform.OS !== 'android') return
  await activeModule.dismissNotificationAsync(PERSISTENT_REMINDER_ID)
}

/**
 * Reconciles the ongoing reminder with the latest widget feed. No-ops while the
 * toggle is off; cancels when the feed is unavailable (signed out); otherwise
 * re-posts the notification in place with the current streak and progress.
 */
export async function refreshPersistentReminder(data: unknown | null): Promise<void> {
  if (!usePersistentReminderStore.getState().enabled) return

  const activeModule = notificationsModule
  if (!activeModule || Platform.OS !== 'android') return

  if (data === null) {
    await activeModule.dismissNotificationAsync(PERSISTENT_REMINDER_ID)
    return
  }

  const feed = extractReminderFeed(data)
  if (!feed) return
  await postReminder(activeModule, feed)
}
