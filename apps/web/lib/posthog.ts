'use client'

import type { CaptureResult, PostHogInterface } from 'posthog-js'

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
let posthog: PostHogClient | null = null
let loading: Promise<PostHogClient> | null = null
let initialized = false
let analyticsEnabled = false
let accountId: string | null = null
let pendingHabitEvents = 0
let pendingReset = false
let identityReady = false

function activatePostHog(client: PostHogInterface): void {
  const shouldReset = pendingReset || (!identityReady && !accountId)
    || (accountId !== null && client.get_distinct_id() !== accountId)
  identityReady = false
  if (shouldReset) client.reset()
  pendingReset = false
  if (accountId) client.identify(accountId)
  identityReady = true
  client.opt_in_capturing()
}

export async function applyPostHogGate(enabled: boolean): Promise<void> {
  analyticsEnabled = enabled
  if (!key) return
  if (!enabled) {
    pendingHabitEvents = 0
    posthog?.opt_out_capturing()
    return
  }

  if (posthog) {
    activatePostHog(posthog)
    return
  }

  loading ??= import('posthog-js').then((module) => module.default)
  const client = await loading
  if (!analyticsEnabled) return
  if (!initialized) {
    client.init(key, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      autocapture: false,
      capture_pageview: true,
      capture_performance: { web_vitals: true },
      cross_subdomain_cookie: true,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
      before_send: beforeSend,
      loaded: activatePostHog,
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
  if (analyticsEnabled) posthog.opt_in_capturing()
  else posthog.opt_out_capturing()
}

export function captureHabitLogged(): void {
  if (!key || !analyticsEnabled) return
  if (posthog) posthog.capture('habit_logged')
  else pendingHabitEvents += 1
}
