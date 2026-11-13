import * as Sentry from '@sentry/nextjs'
import { sampleTodayLaunch } from '@orbit/shared/utils/today-launch'
import { startTodayLaunch } from '@/lib/today-launch'
import { beforeSendEvent } from '@/lib/sentry-scrub'
import { installStaleBuildRecovery } from '@/lib/stale-build-recovery'
import { SENTRY_TUNNEL_ROUTE } from '@/lib/public-paths'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  release: process.env.NEXT_PUBLIC_WEB_COMMIT_SHA || undefined,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',
  tracesSampler: sampleTodayLaunch,
  tunnel: SENTRY_TUNNEL_ROUTE,
  sendDefaultPii: false,
  beforeSend: beforeSendEvent,
})

startTodayLaunch()
installStaleBuildRecovery()

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
