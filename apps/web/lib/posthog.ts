'use client'

import posthog from 'posthog-js'

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
let initialized = false
let analyticsEnabled = true
let accountId: string | null = null

export function initializePostHog(enabled: boolean): void {
  if (!key || initialized) return
  analyticsEnabled = enabled
  posthog.init(key, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    autocapture: true,
    capture_pageview: true,
    capture_performance: { web_vitals: true },
    cross_subdomain_cookie: true,
    disable_session_recording: true,
    opt_out_capturing_by_default: !enabled,
  })
  initialized = true
  if (accountId && enabled) posthog.identify(accountId)
}

export function applyPostHogGate(enabled: boolean): void {
  analyticsEnabled = enabled
  if (!initialized) return
  if (enabled) {
    posthog.opt_in_capturing()
    if (accountId) posthog.identify(accountId)
  } else {
    posthog.opt_out_capturing()
  }
}

export function identifyPostHogUser(userId: string): void {
  accountId = userId.toLowerCase()
  if (initialized && analyticsEnabled) posthog.identify(accountId)
}

export function resetPostHogUser(): void {
  accountId = null
  if (!initialized) return
  posthog.reset()
  if (analyticsEnabled) posthog.opt_in_capturing()
  else posthog.opt_out_capturing()
}

export function captureHabitLogged(): void {
  if (initialized && analyticsEnabled) posthog.capture('habit_logged')
}
