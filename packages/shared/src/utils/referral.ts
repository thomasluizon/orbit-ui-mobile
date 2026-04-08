export function buildReferralUrl(code: string | null | undefined): string {
  if (!code) {
    return ''
  }

  return `https://app.useorbit.org/r/${code}`
}
