import * as Sentry from '@sentry/nextjs'
import { sampleTodayLaunch } from '@orbit/shared/utils/today-launch'
import { startTodayLaunch } from '@/lib/today-launch'
import { beforeSendEvent } from '@/lib/sentry-scrub'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',
  tracesSampler: sampleTodayLaunch,
  sendDefaultPii: false,
  beforeSend: beforeSendEvent,
})

startTodayLaunch()

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
