export type AuthCallbackFailureReason = 'missing_code' | 'missing_state' | 'provider_error' | 'state_mismatch'
  | 'exchange_failed' | 'session_changed' | 'profile_hydration_failed'

/** The state a provider callback shows. A cancel is the person leaving the consent screen of the provider, which is not a failure. */
export type AuthCallbackState = 'pending' | 'failed' | 'cancelled' | 'account'

const CANCEL_ERRORS: readonly string[] = ['access_denied', 'cancel', 'dismiss']

/** Whether the provider reported that the person left its consent screen. */
export function isAuthCallbackCancel(error: string | null | undefined): boolean {
  return typeof error === 'string' && CANCEL_ERRORS.includes(error)
}

export class AuthCallbackError extends Error {
  constructor(readonly reason: AuthCallbackFailureReason) {
    super(reason)
  }
}

export function readAuthCallbackInput(error: boolean, code: unknown, state: unknown):
  { reason: AuthCallbackFailureReason } | { reason: null; code: string; state: string } {
  if (error) return { reason: 'provider_error' }
  if (typeof code !== 'string' || !code) return { reason: 'missing_code' }
  if (typeof state !== 'string' || !state) return { reason: 'missing_state' }
  return { reason: null, code, state }
}

export function createAuthCallbackFailureReporter(provider: 'apple' | 'google', capture: (message: string, context: {
  level: 'error'; tags: { provider: 'apple' | 'google'; reason: AuthCallbackFailureReason }
}) => unknown): (reason: AuthCallbackFailureReason) => void {
  let reported = false
  return (reason) => {
    if (reported) return
    reported = true
    capture('auth_callback_failed', { level: 'error', tags: { provider, reason } })
  }
}
