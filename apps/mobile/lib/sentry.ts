import * as Sentry from '@sentry/react-native'
import type { ErrorEvent } from '@sentry/react-native'

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

/**
 * Strips PII from a Sentry event before it leaves the device: removes the user's email, username,
 * and IP, redacts auth headers and request bodies from HTTP breadcrumbs, and drops console
 * breadcrumbs (which can echo tokens or chat content). The SecureStore auth/refresh tokens are
 * never attached in the first place; this is defense-in-depth for anything that slips into context.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    delete event.user.email
    delete event.user.username
    delete event.user.ip_address
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((breadcrumb) => breadcrumb.category !== 'console')
      .map((breadcrumb) => {
        if (breadcrumb.category === 'http' && breadcrumb.data) {
          const { Authorization, authorization, request_body, ...rest } = breadcrumb.data
          return { ...breadcrumb, data: rest }
        }
        return breadcrumb
      })
  }

  return event
}

/**
 * Installs the Sentry React Native SDK with PII scrubbing. No-ops when EXPO_PUBLIC_SENTRY_DSN is
 * unset so local/dev builds without a DSN run with Sentry disabled instead of erroring.
 */
export function initSentry(): void {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  })
}

/**
 * Reports a caught error to Sentry. Used by the root render-error boundary so a crash that the
 * boundary recovers from is still captured.
 */
export function captureError(error: unknown): void {
  Sentry.captureException(error)
}
