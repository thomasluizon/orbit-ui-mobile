import type { ErrorEvent } from '@sentry/nextjs'

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie']

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
        if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
          delete event.request.headers[key]
        }
      }
    }
    delete event.request.cookies
    delete event.request.data
  }

  return event
}
