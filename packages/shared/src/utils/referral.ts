const REFERRAL_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/

/** Whether a value looks like a referral/invite code (URL-safe token shape). */
export function isValidReferralCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && REFERRAL_CODE_PATTERN.test(value)
}

export function buildReferralUrl(code: string | null | undefined): string {
  if (!code) {
    return ''
  }

  return `https://app.useorbit.org/r/${code}`
}

export function buildRecapShareUrl(
  code: string | null | undefined,
  period: string,
): string {
  if (!code) {
    return ''
  }

  return `https://app.useorbit.org/r/${code}?recap=${period}`
}
