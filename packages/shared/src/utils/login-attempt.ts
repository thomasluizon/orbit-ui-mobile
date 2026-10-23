import { isValidEmail } from './email'
import { isValidVerificationCode } from './auth-login'

export interface LoginEmailLink {
  email: string
  code: string
}

export function readLoginEmailLink(
  email: unknown,
  code: unknown,
  previous: LoginEmailLink | null = null,
  enabled = true,
): LoginEmailLink | null | undefined {
  if (!enabled || (email === undefined && code === undefined)) return undefined
  if (typeof email !== 'string' || !isValidEmail(email) || typeof code !== 'string' || !isValidVerificationCode(code)) return null
  const link = { email: email.trim(), code }
  return link.email === previous?.email && link.code === previous.code ? undefined : link
}

export function isSafeAuthReturnUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    && !value.includes('\\') && !/[\u0000-\u001f\u007f]/.test(value)
}

export interface LoginAttempt {
  revision: number
  email: string
  epoch: number
}

export class LoginAttemptScope {
  private revision = 0
  private request: { attempt: LoginAttempt; cancel: () => void } | null = null

  capture(email: string, epoch: number): LoginAttempt {
    return { revision: this.revision, email: email.trim(), epoch }
  }

  owns(attempt: LoginAttempt, epoch: number): boolean {
    return attempt.revision === this.revision && attempt.epoch === epoch
  }

  watch(attempt: LoginAttempt, cancel: () => void): void {
    this.request = { attempt, cancel }
  }

  release(attempt: LoginAttempt): void {
    if (this.request?.attempt === attempt) this.request = null
  }

  invalidate(): void {
    this.revision += 1
    this.request?.cancel()
    this.request = null
  }

  observeSession(epoch: number): void {
    if (this.request && !this.owns(this.request.attempt, epoch)) this.invalidate()
  }
}
