import type { ErrorEvent, EventHint } from '@sentry/nextjs'
import { ApiClientError } from '@orbit/shared'

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie'])

const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524])
const EXPECTED_API_ERROR_CODES = new Set(['AI_UNAVAILABLE', 'CONCURRENT_UPDATE_CONFLICT'])

/**
 * True for ApiClientErrors that represent expected, already-user-handled states rather than
 * defects worth alerting on: a transient upstream gateway blip (502/503/504/520-524, which the
 * orbit-api project alerts on at the source), the optimistic-concurrency conflict the UI tells the
 * user to retry, or an upstream AI outage the UI already toasts. Matched by status/error code, never
 * by localized message.
 */
export function isExpectedApiClientError(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false
  if (TRANSIENT_GATEWAY_STATUSES.has(error.status)) return true
  return error.code !== undefined && EXPECTED_API_ERROR_CODES.has(error.code)
}

/**
 * Sentry `beforeSend` hook: drops expected, user-handled ApiClientErrors (see
 * {@link isExpectedApiClientError}) so they never reach Sentry, then scrubs PII from everything else.
 */
export function beforeSendEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isExpectedApiClientError(hint.originalException)) return null
  return scrubEvent(event)
}

/**
 * Strips PII from a Sentry event before it leaves the browser/server: removes the user's email,
 * username, and IP; drops auth/cookie request headers, all request cookies, and the request body
 * (which can carry the email submitted to the send-code/verify-code auth flows, habit names, or
 * chat content). The opaque user id, route, and HTTP method are retained as non-PII diagnostics.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    delete event.user.email
    delete event.user.username
    delete event.user.ip_address
  }

  if (event.request) {
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
          delete event.request.headers[key]
        }
      }
    }
    delete event.request.cookies
    delete event.request.data
  }

  return event
}
