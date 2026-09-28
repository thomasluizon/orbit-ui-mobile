'use client'

import type { CaptureResult } from 'posthog-js'

type PostHogClient = typeof import('posthog-js')['default']

const URL_PROPERTY = /url|href|pathname|referrer/i
const CREDENTIAL_PARAMETERS = new Set(['code', 'state', 'access_token', 'refresh_token', 'provider_token'])

function isSensitiveUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://useorbit.org')
    if (/\/auth-callback\/?$/.test(url.pathname)) return true
    const fragment = url.hash.slice(1)
    if (/\/auth-callback(?:\?|$)/.test(fragment)) return true
    const fragmentParameters = new URLSearchParams(fragment.includes('?') ? fragment.split('?')[1] : fragment)
    return [...url.searchParams.keys(), ...fragmentParameters.keys()]
      .some((name) => CREDENTIAL_PARAMETERS.has(name.toLowerCase()))
  } catch {
    return /(?:[?#&])(?:code|state|access_token|refresh_token|provider_token)=/i.test(value)
  }
}

function scrubUrlProperties(value: unknown, propertyName = ''): unknown {
  if (typeof value === 'string' && URL_PROPERTY.test(propertyName)) {
    return value.split(/[?#]/, 1)[0]
  }
  if (Array.isArray(value)) return value.map((item) => scrubUrlProperties(item, propertyName))
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, scrubUrlProperties(item, name)]))
  }
  return value
}

function containsSensitiveUrl(value: unknown, propertyName = ''): boolean {
  if (typeof value === 'string') return URL_PROPERTY.test(propertyName) && isSensitiveUrl(value)
  if (Array.isArray(value)) return value.some((item) => containsSensitiveUrl(item, propertyName))
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).some(([name, item]) => containsSensitiveUrl(item, name))
  }
  return false
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event || !identityReady || !analyticsEnabled || isSensitiveUrl(globalThis.location.href)) return null
  if (containsSensitiveUrl(event.properties) || containsSensitiveUrl(event.$set) || containsSensitiveUrl(event.$set_once)) return null
  return {
    ...event,
    properties: scrubUrlProperties(event.properties) as CaptureResult['properties'],
    $set: event.$set ? scrubUrlProperties(event.$set) as CaptureResult['$set'] : undefined,
    $set_once: event.$set_once ? scrubUrlProperties(event.$set_once) as CaptureResult['$set_once'] : undefined,
  }
}

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
const PREFERENCE_KEY = 'analytics-opt-out'
function readAnalyticsOptOut(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(PREFERENCE_KEY) === 'true'
  } catch {
    return true
  }
}
let posthog: PostHogClient | null = null
let loading: Promise<PostHogClient | null> | null = null
let initialized = false
let analyticsEnabled = false
let serverEnabled = false
let optedOut = readAnalyticsOptOut()
const preferenceListeners = new Set<() => void>()
let accountId: string | null = null
let pendingHabitEvents = 0
let pendingReset = false
let identityReady = false

function activatePostHog(client: PostHogClient): void {
  if (!analyticsEnabled) {
    client.opt_out_capturing()
    return
  }
  const shouldReset = pendingReset || (!identityReady && !accountId)
    || (accountId !== null && client.get_distinct_id() !== accountId)
  identityReady = false
  if (shouldReset) client.reset()
  pendingReset = false
  if (accountId) client.identify(accountId)
  identityReady = true
  client.opt_in_capturing({ captureEventName: false })
}

export async function applyPostHogGate(enabled: boolean): Promise<void> {
  serverEnabled = enabled
  analyticsEnabled = enabled && !optedOut
  if (!key) return
  if (!analyticsEnabled) {
    pendingHabitEvents = 0
    posthog?.opt_out_capturing()
    return
  }

  if (posthog) {
    activatePostHog(posthog)
    return
  }

  loading ??= import('posthog-js').then((module) => module.default).catch(() => {
    loading = null
    analyticsEnabled = false
    pendingHabitEvents = 0
    return null
  })
  const client = await loading
  if (!client) return
  if (!serverEnabled || optedOut) return
  if (!initialized) {
    client.init(key, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      autocapture: false,
      capture_pageview: 'history_change',
      capture_performance: { web_vitals: true },
      cross_subdomain_cookie: true,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
      before_send: beforeSend,
      loaded: () => activatePostHog(client),
    })
    posthog = client
    initialized = true
    while (pendingHabitEvents > 0) {
      client.capture('habit_logged')
      pendingHabitEvents -= 1
    }
    return
  }

  activatePostHog(client)
}

export function getAnalyticsOptOut(): boolean {
  return optedOut
}

export function subscribeAnalyticsOptOut(listener: () => void): () => void {
  preferenceListeners.add(listener)
  return () => { preferenceListeners.delete(listener) }
}

export async function setAnalyticsOptOut(next: boolean): Promise<void> {
  localStorage.setItem(PREFERENCE_KEY, String(next))
  optedOut = next
  preferenceListeners.forEach((listener) => listener())
  await applyPostHogGate(serverEnabled)
}

export function identifyPostHogUser(userId: string): void {
  const previousAccountId = accountId
  accountId = userId.toLowerCase()
  if (posthog && analyticsEnabled) {
    if (previousAccountId && previousAccountId !== accountId) {
      identityReady = false
      posthog.reset()
    }
    posthog.identify(accountId)
    identityReady = true
  }
}

export function resetPostHogUser(): void {
  accountId = null
  pendingHabitEvents = 0
  pendingReset = true
  if (!posthog) return
  identityReady = false
  posthog.reset()
  pendingReset = false
  identityReady = true
  if (analyticsEnabled) posthog.opt_in_capturing({ captureEventName: false })
  else posthog.opt_out_capturing()
}

export function captureHabitLogged(): void {
  if (!key || !analyticsEnabled) return
  if (posthog) posthog.capture('habit_logged')
  else pendingHabitEvents += 1
}
