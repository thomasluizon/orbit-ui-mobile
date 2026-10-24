import * as Sentry from '@sentry/nextjs'
import { startTodayLaunchTiming } from '@orbit/shared/utils/today-launch'

let finishLaunch: ((fromCache: boolean, empty: boolean) => void) | undefined

export function startTodayLaunch(): void {
  finishLaunch = startTodayLaunchTiming(Sentry.startInactiveSpan, performance.timeOrigin / 1000, 'navigation')
}

export function finishTodayLaunch(fromCache: boolean, empty: boolean): void {
  finishLaunch?.(fromCache, empty)
}
