import { PostHog } from 'posthog-react-native'

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY

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
let accountId: string | null = null
let gateQueue = Promise.resolve()

export function applyPostHogGate(enabled: boolean): Promise<void> {
  analyticsEnabled = enabled
  if (!posthog) return Promise.resolve()
  gateQueue = gateQueue.then(async () => {
    if (enabled) {
      await posthog.optIn()
      if (accountId) posthog.identify(accountId)
    } else {
      await posthog.optOut()
    }
  })
  return gateQueue
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
