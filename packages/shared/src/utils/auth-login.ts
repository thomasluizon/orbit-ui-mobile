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
