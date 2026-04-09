export const VERIFICATION_CODE_LENGTH = 6

export const AUTH_BACKEND_ERROR_MAP: Record<string, string> = {
  'Please wait before requesting a new code': 'auth.errors.rateLimited',
  'Verification code expired or not found': 'auth.errors.codeExpired',
  'Too many attempts. Please request a new code': 'auth.errors.tooManyAttempts',
  'Invalid verification code': 'auth.errors.invalidCode',
  'Invalid email format': 'auth.errors.invalidEmail',
}

export function getAuthLoginErrorKey(error: string): string | undefined {
  return AUTH_BACKEND_ERROR_MAP[error]
}

export interface AuthLoginErrorInput {
  /** HTTP status when known (from ApiClientError.status or Response.status). */
  status?: number
  /** Parsed backend `error` string from the JSON body, when present. */
  backendMessage?: string
  /** Raw caught value, used only to detect network / TypeError. */
  raw?: unknown
  /** Discriminator: when set to 'google', unknown errors map to googleError. */
  source?: 'google' | 'magic-code'
}

function extractFromRecord(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.error === 'string') return obj.error
  if (typeof obj.message === 'string' && obj.message.length > 0) {
    // Avoid leaking fallback "Request failed: N" strings.
    if (/^Request failed:\s*\d+/.test(obj.message)) return undefined
    return obj.message
  }
  const errors = obj.errors
  if (errors && typeof errors === 'object') {
    const first = Object.values(errors as Record<string, unknown>)[0]
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'string') {
      return first[0] as string
    }
  }
  return undefined
}

/**
 * Pulls a backend error string from an arbitrary caught value without ever
 * returning transport-level fallback messages.
 */
export function extractAuthBackendMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const obj = err as Record<string, unknown>

  // ApiClientError / Error subclass: check data first, then message.
  const data = obj.data
  if (data && typeof data === 'object') {
    const fromData = extractFromRecord(data as Record<string, unknown>)
    if (fromData) return fromData
    const nested = (data as Record<string, unknown>).data
    if (nested && typeof nested === 'object') {
      const fromNested = extractFromRecord(nested as Record<string, unknown>)
      if (fromNested) return fromNested
    }
  }

  const body = obj.body
  if (body && typeof body === 'object') {
    const fromBody = extractFromRecord(body as Record<string, unknown>)
    if (fromBody) return fromBody
  }

  return extractFromRecord(obj)
}

/**
 * Map any login failure to a friendly i18n key under `auth.errors.*`.
 * Never returns the raw backend string.
 */
export function resolveAuthLoginErrorKey(input: AuthLoginErrorInput): string {
  if (input.backendMessage) {
    const mapped = AUTH_BACKEND_ERROR_MAP[input.backendMessage]
    if (mapped) return mapped
  }

  switch (input.status) {
    case 400:
    case 422:
      return 'auth.errors.invalidRequest'
    case 401:
      return 'auth.errors.unauthorized'
    case 403:
      return 'auth.errors.forbidden'
    case 404:
      return 'auth.errors.emailNotFound'
    case 409:
      return 'auth.errors.conflict'
    case 429:
      return 'auth.errors.rateLimited'
    case 500:
    case 502:
    case 503:
    case 504:
      return 'auth.errors.serverError'
    default:
      break
  }

  if (input.raw instanceof TypeError) return 'auth.errors.networkError'

  if (input.source === 'google') return 'auth.errors.googleError'

  return 'auth.errors.unknownError'
}

export function isValidVerificationCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}

export function normalizeVerificationCodeInput(value: string): string {
  return value.replaceAll(/\D/g, '')
}

export function createVerificationCodeDigits(length = VERIFICATION_CODE_LENGTH): string[] {
  return Array.from({ length }, () => '')
}

export function fillVerificationCodeDigits(
  startIndex: number,
  cleanValue: string,
  current: string[],
  codeLength = VERIFICATION_CODE_LENGTH,
): { digits: string[]; nextFocusIndex: number } {
  const chars = cleanValue.split('')
  const nextDigits = [...current]

  for (let index = 0; index < chars.length && startIndex + index < codeLength; index += 1) {
    nextDigits[startIndex + index] = chars[index] ?? ''
  }

  return {
    digits: nextDigits,
    nextFocusIndex: Math.min(startIndex + chars.length, codeLength - 1),
  }
}

export function isVerificationCodeComplete(
  digits: readonly string[],
  codeLength = VERIFICATION_CODE_LENGTH,
): boolean {
  return digits.join('').length === codeLength
}
