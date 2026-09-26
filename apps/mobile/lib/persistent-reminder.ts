import { Platform } from 'react-native'
import { schemes } from '@orbit/shared/theme'
import { i18n } from '@/lib/i18n'
import { getAccountIdFromToken } from '@/lib/jwt-session'
import {
  normalizePermissionStatus,
  type NotificationPermissionsResponse,
} from '@/lib/push-notification-permissions'
import { usePersistentReminderStore } from '@/stores/persistent-reminder-store'
import { nativeOrbitWidgetModule } from '../modules/orbit-widget/src/OrbitWidgetModule'
import type { OrbitWidgetModuleType } from '../modules/orbit-widget/src/OrbitWidget.types'

const PERSISTENT_REMINDER_ID = 'orbit-persistent-reminder'
const PERSISTENT_REMINDER_CHANNEL_ID = 'persistent-reminder'

/** Streak and today's progress projected from the same widget feed payload. */
export interface ReminderFeed {
  streak: number
  completed: number
  total: number
}

interface PersistentReminderNotificationsModule {
  AndroidImportance: { LOW: number }
  setNotificationChannelAsync: (
    channelId: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>
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
let reminderNativeModule: OrbitWidgetModuleType | null = nativeOrbitWidgetModule

export function __setPersistentReminderModuleForTests(nextModule: unknown): void {
  notificationsModule = isNotificationsModule(nextModule) ? nextModule : null
}

export function __setPersistentReminderNativeModuleForTests(
  nextModule: OrbitWidgetModuleType | null,
): void {
  reminderNativeModule = nextModule
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCompletedItem(value: unknown): boolean {
  return isRecord(value) && value.isCompleted === true
}

/**
 * Projects the widget feed payload into the streak + today's progress the reminder displays.
 * Returns null when the payload is not a feed object.
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

let presentationGeneration = 0

async function ensureChannel(
  activeModule: PersistentReminderNotificationsModule,
): Promise<void> {
  await activeModule.setNotificationChannelAsync(PERSISTENT_REMINDER_CHANNEL_ID, {
    name: i18n.t('persistentReminder.channelName'),
    importance: activeModule.AndroidImportance.LOW,
    showBadge: false,
  })
}

/**
 * Whether the account that authorised a payload is still the signed-in one. A null token
 * means the payload could not be attributed to an account, which is never enough to post:
 * the reminder shows one account's figures and nothing that identifies whose they are.
 */
async function stillSignedInAs(authorizingToken: string | null): Promise<boolean> {
  if (!authorizingToken) return false
  const authorizingAccount = getAccountIdFromToken(authorizingToken)
  if (!authorizingAccount) return false

  const { getToken } = await import('@/lib/secure-store')
  const signedInToken = await getToken()
  if (!signedInToken) return false
  return getAccountIdFromToken(signedInToken) === authorizingAccount
}

async function postReminder(
  activeModule: PersistentReminderNotificationsModule,
  nativeModule: OrbitWidgetModuleType,
  feed: ReminderFeed,
  authorizingToken: string | null,
  generation: number,
): Promise<void> {
  await ensureChannel(activeModule)
  const { title, body } = buildReminderContent(feed, (key, params) => i18n.t(key, params))
  if (!(await stillSignedInAs(authorizingToken))) return
  if (generation !== presentationGeneration) return

  await nativeModule.postPersistentReminder(
    generation, title, body, schemes.purple.accent.dark.primary,
  )
}

/** True when the ongoing reminder can run on this device (Android + module present). */
export function isPersistentReminderSupported(): boolean {
  return notificationsModule !== null && reminderNativeModule !== null && Platform.OS === 'android'
}

/**
 * Ensures notification permission for the ongoing reminder, prompting once when
 * still undetermined. Returns whether the OS will display the notification.
 */
export async function requestPersistentReminderPermission(): Promise<boolean> {
  const activeModule = notificationsModule
  if (!activeModule || !reminderNativeModule || Platform.OS !== 'android') return false

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

/**
 * Removes the ongoing reminder from the tray. A refresh snapshots the value before its first
 * await and rechecks it immediately before posting.
 */
export async function cancelPersistentReminder(): Promise<void> {
  presentationGeneration += 1
  const activeModule = notificationsModule
  const nativeModule = reminderNativeModule
  if (!activeModule || !nativeModule || Platform.OS !== 'android') return
  await nativeModule.cancelPersistentReminder(presentationGeneration)
  await activeModule.dismissNotificationAsync(PERSISTENT_REMINDER_ID)
}

/**
 * Reconciles the ongoing reminder with the latest widget feed. No-ops while the
 * toggle is off; cancels when the feed is unavailable (signed out); otherwise
 * re-posts the notification in place with the current streak and progress.
 */
export async function refreshPersistentReminder(
  data: unknown,
  authorizingToken: string | null,
): Promise<void> {
  const generation = presentationGeneration
  if (!usePersistentReminderStore.getState().enabled) return

  const activeModule = notificationsModule
  const nativeModule = reminderNativeModule
  if (!activeModule || !nativeModule || Platform.OS !== 'android') return

  if (data === null) {
    presentationGeneration += 1
    await nativeModule.cancelPersistentReminder(presentationGeneration)
    await activeModule.dismissNotificationAsync(PERSISTENT_REMINDER_ID)
    return
  }

  const feed = extractReminderFeed(data)
  if (!feed) return
  await postReminder(activeModule, nativeModule, feed, authorizingToken, generation)
}
