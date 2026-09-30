const REFERRAL_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/

/** Whether a value looks like a referral/invite code (URL-safe token shape). */
export function isValidReferralCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && REFERRAL_CODE_PATTERN.test(value)
}

export function buildReferralUrl(
  code: string | null | undefined,
  origin = 'https://app.useorbit.org',
): string {
  if (!code) {
    return ''
  }

  return `${origin}/r/${code}`
}

export function buildRecapShareUrl(
  code: string | null | undefined,
  period: string,
  origin = 'https://app.useorbit.org',
): string {
  if (!code) {
    return ''
  }

  return `${origin}/r/${code}?recap=${period}`
}

export function withShareLinkOrigin(link: string, origin: string): string {
  if (!link) return link
  const url = new URL(link)
  const targetOrigin = new URL(origin).origin
  if (url.origin === targetOrigin) return link
  return `${targetOrigin}${url.pathname}${url.search}${url.hash}`
}
