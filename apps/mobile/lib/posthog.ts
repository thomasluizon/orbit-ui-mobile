import { PostHog } from 'posthog-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY
const PREFERENCE_KEY = 'analytics-opt-out'

export const posthog = key
  ? new PostHog(key, {
      host: 'https://us.i.posthog.com',
      defaultOptIn: false,
      disableRemoteFeatureFlags: true,
      enableSessionReplay: false,
      captureAppLifecycleEvents: false,
    })
  : null

let analyticsEnabled = false
let serverEnabled: boolean | undefined
let optedOut = false
let persistedOptOut = false
let preferenceLoad: Promise<void> | null = null
let preferenceResolved = false
let preferenceVersion = 0
let storageQueue = Promise.resolve()
let accountId: string | null = null
let gateQueue = Promise.resolve()
let gateVersion = 0
let gateReady = false
let pendingAndroidUpdateCaptures: (() => void)[] = []

export async function getAnalyticsOptOut(): Promise<boolean> {
  preferenceLoad ??= AsyncStorage.getItem(PREFERENCE_KEY).then((value) => {
    optedOut = value === 'true'
    persistedOptOut = optedOut
    preferenceResolved = true
  }).catch(() => {
    optedOut = true
    persistedOptOut = true
    preferenceResolved = true
  })
  await preferenceLoad
  return optedOut
}

export function applyPostHogGate(enabled: boolean | undefined): Promise<void> {
  serverEnabled = enabled
  analyticsEnabled = false
  gateReady = false
  const version = ++gateVersion
  if (!posthog) return Promise.resolve()
  gateQueue = gateQueue.then(async () => {
    await getAnalyticsOptOut()
    if (optedOut) pendingAndroidUpdateCaptures = []
    if (version !== gateVersion) return
    const allowed = serverEnabled === true && !optedOut
    if (allowed) {
      await posthog.optIn()
    } else {
      await posthog.optOut()
    }
    if (version !== gateVersion) return
    analyticsEnabled = allowed
    if (allowed && accountId) posthog.identify(accountId)
    gateReady = serverEnabled !== undefined
    if (!gateReady) return
    const captures = pendingAndroidUpdateCaptures
    pendingAndroidUpdateCaptures = []
    if (allowed) for (const capture of captures) capture()
  })
  return gateQueue
}

export async function setAnalyticsOptOut(next: boolean): Promise<void> {
  await getAnalyticsOptOut()
  const version = ++preferenceVersion
  optedOut = next
  const gateUpdate = applyPostHogGate(serverEnabled)
  try {
    await gateUpdate
    const write = storageQueue.then(async () => {
      await AsyncStorage.setItem(PREFERENCE_KEY, String(next))
      persistedOptOut = next
    })
    storageQueue = write.catch(() => {})
    await write
  } catch (error) {
    if (version === preferenceVersion) {
      optedOut = persistedOptOut
      await applyPostHogGate(serverEnabled)
    }
    throw error
  }
}

export function identifyPostHogUser(userId: string, previousUserId?: string | null): void {
  if (previousUserId && previousUserId !== userId) resetPostHogUser()
  accountId = userId.toLowerCase()
  if (posthog && analyticsEnabled) posthog.identify(accountId)
}

export function resetPostHogUser(): void {
  accountId = null
  pendingAndroidUpdateCaptures = []
  if (!posthog) return
  posthog.reset()
  void applyPostHogGate(serverEnabled)
}

export function captureHabitLogged(): void {
  if (posthog && analyticsEnabled) void posthog.capture('habit_logged')
}

export function captureScreen(name: string): void {
  if (posthog && analyticsEnabled) void posthog.screen(name)
}

export function capturePurchase(event: 'purchase_started' | 'purchase_verified', store: 'play' | 'app_store'): void {
  if (posthog && analyticsEnabled) void posthog.capture(event, { store })
}

export function captureAndroidUpdateCheck(properties: {
  outcome: 'success' | 'service_unavailable' | 'error'
  play_status: number | null
  available_version_code: number | null
  installed_version_code: number
  play_error_code: number | null
}): void {
  captureAndroidUpdateWhenReady(() => { void posthog?.capture('android_update_checked', properties) })
}

export function captureAndroidUpdateSheetShown(properties: {
  sheet: 'available' | 'ready'
  available_version_code: number | null
  installed_version_code: number
}): void {
  captureAndroidUpdateWhenReady(() => { void posthog?.capture('android_update_sheet_shown', properties) })
}

function captureAndroidUpdateWhenReady(capture: () => void): void {
  if (!posthog) return
  if (!gateReady) {
    if (preferenceResolved && optedOut) return
    pendingAndroidUpdateCaptures.push(capture)
    return
  }
  if (analyticsEnabled) capture()
}
