'use client'

import posthog from 'posthog-js'
import type { CaptureResult } from 'posthog-js'

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
  if (!event || isSensitiveUrl(globalThis.location.href)) return null
  if (containsSensitiveUrl(event.properties) || containsSensitiveUrl(event.$set) || containsSensitiveUrl(event.$set_once)) return null
  return {
    ...event,
    properties: scrubUrlProperties(event.properties) as CaptureResult['properties'],
    $set: event.$set ? scrubUrlProperties(event.$set) as CaptureResult['$set'] : undefined,
    $set_once: event.$set_once ? scrubUrlProperties(event.$set_once) as CaptureResult['$set_once'] : undefined,
  }
}

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
    autocapture: false,
    capture_pageview: true,
    capture_performance: { web_vitals: true },
    cross_subdomain_cookie: true,
    disable_session_recording: true,
    opt_out_capturing_by_default: !enabled,
    before_send: beforeSend,
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
