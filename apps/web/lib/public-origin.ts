export function getPublicOrigin(): string {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.useorbit.org').origin
}
