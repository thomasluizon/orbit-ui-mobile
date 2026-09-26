export interface TurnstileTokenState {
  token: string | null
  resetKey: number
}

interface TokenRequest {
  state: TurnstileTokenState
  protection: { turnstileToken?: string } | null
}

export interface TurnstileTokenView extends TurnstileTokenState {
  onToken: (token: string | null) => void
  takeToken: () => TokenRequest['protection']
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
    this.state = clearTurnstileToken(this.state)
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
      onToken: this.receive,
      takeToken: () => this.take(siteKey),
    }
  }
}
