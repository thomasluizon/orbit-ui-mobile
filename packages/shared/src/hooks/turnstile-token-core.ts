// WHY: the first challenge of a fresh WebView fails once, so the next run waits this long, not the 8000 ms retry-interval default https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
export const TURNSTILE_RETRY_INTERVAL_MS = 2000
/** A load of the human check that fails or answers a temporary status loads again every retry interval. The person sees the failure only when the check gives no sign for this long: each sign that the check runs again starts the time again. */
// WHY: a sleeping Render web service answers 503 with its own loading page while it wakes, and Render puts the wake at about one minute https://render.com/docs/free
export const TURNSTILE_LOAD_DEADLINE_MS = 60_000
/** The sign-in forms keep a slot of this height for the human check in every state, so the column does not move when the state changes. */
// WHY: Cloudflare sizes the flexible widget at 100% width and 65px height https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
export const TURNSTILE_CHALLENGE_HEIGHT = 65
export const TURNSTILE_CHALLENGE_HOST = 'challenges.cloudflare.com'

/** The bridge page tells the app each stage of Cloudflare's script load, so the app names its own deadline as the web widget does. */
export type TurnstileBridgeStage = 'script_started' | 'script_loaded'

export interface TurnstileLoadFailure {
  /** `script_deadline`: Cloudflare's script did not load in the deadline. `run_deadline`: a run of the check gave no sign in the deadline. */
  kind: 'http' | 'load' | 'script' | 'script_deadline' | 'challenge' | 'run_deadline' | 'message'
  host: string
  statusCode?: number
  code?: string
  description?: string
}

interface TurnstileLoadFailureContext {
  level: 'warning'
  tags: { operation: 'turnstile_load'; kind: TurnstileLoadFailure['kind']; host: string; status_code: number | null; code: string | null }
  extra: { description: string | null; elapsed_ms: number }
  fingerprint: string[]
}

/** Reports the failures of one load of the human check: one event for each different kind, status or code, and host, with the time since the load started. */
export function createTurnstileLoadFailureReporter(
  capture: (message: string, context: TurnstileLoadFailureContext) => unknown,
): (failure: TurnstileLoadFailure) => void {
  const startedAt = Date.now()
  const reported = new Set<string>()
  return ({ kind, host, statusCode, code, description }) => {
    const cause = String(statusCode ?? code ?? '')
    const identity = [kind, cause, host].join(' ')
    if (reported.has(identity)) return
    reported.add(identity)
    capture('turnstile_load_failed', {
      level: 'warning',
      tags: { operation: 'turnstile_load', kind, host, status_code: statusCode ?? null, code: code ?? null },
      extra: { description: description ?? null, elapsed_ms: Date.now() - startedAt },
      fingerprint: ['turnstile_load_failed', kind, cause],
    })
  }
}

export interface TurnstileTokenState {
  token: string | null
  resetKey: number
}

interface TokenRequest {
  state: TurnstileTokenState
  protection: { turnstileToken?: string } | null
}

export interface TurnstileTokenView extends TurnstileTokenState {
  onToken: (token: string | null) => boolean
  takeToken: () => TokenRequest['protection']
  resetToken: () => void
}

export function createTurnstileTokenState(): TurnstileTokenState {
  return { token: null, resetKey: 0 }
}

export function receiveTurnstileToken(state: TurnstileTokenState, token: string | null): TurnstileTokenState {
  return { ...state, token }
}

export function clearTurnstileToken(state: TurnstileTokenState): TurnstileTokenState {
  return receiveTurnstileToken(state, null)
}

export function takeTurnstileToken(state: TurnstileTokenState, siteKey: string | undefined): TokenRequest {
  if (!siteKey) return { state, protection: {} }
  if (!state.token) return { state, protection: null }
  return {
    state: { token: null, resetKey: state.resetKey + 1 },
    protection: { turnstileToken: state.token },
  }
}

export class TurnstileTokenController {
  private state = createTurnstileTokenState()

  constructor(private readonly publish: (state: TurnstileTokenState) => void) {}

  receive = (token: string | null): void => {
    this.state = receiveTurnstileToken(this.state, token)
    this.publish(this.state)
  }

  clear = (): void => {
    this.reset()
  }

  reset = (): void => {
    this.state = { token: null, resetKey: this.state.resetKey + 1 }
    this.publish(this.state)
  }

  take = (siteKey: string | undefined): TokenRequest['protection'] => {
    const result = takeTurnstileToken(this.state, siteKey)
    if (result.state !== this.state) {
      this.state = result.state
      this.publish(this.state)
    }
    return result.protection
  }

  view(state: TurnstileTokenState, siteKey: string | undefined): TurnstileTokenView {
    return {
      ...state,
      onToken: (token) => {
        if (state.resetKey !== this.state.resetKey) return false
        this.receive(token)
        return true
      },
      takeToken: () => this.take(siteKey),
      resetToken: this.reset,
    }
  }
}
