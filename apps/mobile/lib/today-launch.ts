import * as Sentry from '@sentry/react-native'
import { startTodayLaunchTiming } from '@orbit/shared/utils/today-launch'

let finishLaunch: ((fromCache: boolean, empty: boolean) => void) | undefined

export function startTodayLaunch(): void {
  const startupPerformance = performance as typeof performance & {
    rnStartupTiming?: { startTime: number | null }
  }
  const nativeStart = startupPerformance.rnStartupTiming?.startTime
  const hasNativeStart = nativeStart != null
  const startTime = hasNativeStart ? (performance.timeOrigin + nativeStart) / 1000 : Date.now() / 1000
  finishLaunch = startTodayLaunchTiming(Sentry.startInactiveSpan, startTime, hasNativeStart ? 'native' : 'javascript')
}

export function finishTodayLaunch(fromCache: boolean, empty: boolean): void {
  finishLaunch?.(fromCache, empty)
}
