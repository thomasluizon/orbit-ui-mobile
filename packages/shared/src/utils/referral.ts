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
