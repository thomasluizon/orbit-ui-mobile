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
let serverEnabled = false
let optedOut = false
let preferenceReady = false
let preferenceLoad: Promise<boolean> | null = null
let preferenceVersion = 0
let storageQueue = Promise.resolve()
let accountId: string | null = null
let gateQueue = Promise.resolve()

export function getAnalyticsOptOut(): Promise<boolean> {
  preferenceLoad ??= AsyncStorage.getItem(PREFERENCE_KEY).then((value) => {
    optedOut = value === 'true'
    preferenceReady = true
    return optedOut
  }).catch(() => {
    optedOut = true
    preferenceReady = true
    return true
  })
  return preferenceLoad
}

export function applyPostHogGate(enabled: boolean): Promise<void> {
  serverEnabled = enabled
  analyticsEnabled = preferenceReady && enabled && !optedOut
  if (!posthog) return Promise.resolve()
  gateQueue = gateQueue.then(async () => {
    await getAnalyticsOptOut()
    analyticsEnabled = serverEnabled && !optedOut
    if (analyticsEnabled) {
      await posthog.optIn()
      if (accountId) posthog.identify(accountId)
    } else {
      await posthog.optOut()
    }
  })
  return gateQueue
}

export async function setAnalyticsOptOut(next: boolean): Promise<void> {
  await getAnalyticsOptOut()
  const previous = optedOut
  const version = ++preferenceVersion
  optedOut = next
  analyticsEnabled = serverEnabled && !next
  const gateUpdate = applyPostHogGate(serverEnabled)
  try {
    await gateUpdate
    const write = storageQueue.then(() => AsyncStorage.setItem(PREFERENCE_KEY, String(next)))
    storageQueue = write.catch(() => {})
    await write
  } catch (error) {
    if (version === preferenceVersion) {
      optedOut = previous
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
  if (!posthog) return
  posthog.reset()
  void applyPostHogGate(analyticsEnabled)
}

export function captureHabitLogged(): void {
  if (posthog && analyticsEnabled) void posthog.capture('habit_logged')
}

export function captureScreen(name: string): void {
  if (posthog && analyticsEnabled) void posthog.screen(name)
}
