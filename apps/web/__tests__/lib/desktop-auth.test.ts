import { afterEach, expect, it, vi } from 'vitest'
import { desktopAttemptSchema, desktopRedirectUri } from '@/lib/desktop-auth'

afterEach(() => vi.unstubAllEnvs())

it.each([
  ['https://app.useorbit.org', 'org.useorbit.desktop://auth/callback'],
  ['https://app-staging.useorbit.org', 'org.useorbit.desktop.staging://auth/callback'],
] as const)('selects the native callback for the exact deployed origin %s', (origin, callback) => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
  expect(desktopRedirectUri()).toBe(callback)
})

const insecureOrigin = new URL('https://app.useorbit.org')
insecureOrigin.protocol = 'http:'

it.each([
  undefined, '', 'http://localhost:3000', insecureOrigin.origin,
  'https://app.useorbit.org/', 'https://app.useorbit.org.attacker.example',
])('does not provide a native callback for an unrecognized build origin %s', origin => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
  expect(desktopRedirectUri()).toBeNull()
})

it('accepts the native proof shape and rejects malformed states and challenges', () => {
  const attempt = { state: 'a'.repeat(64), codeChallenge: 'A'.repeat(43), redirectUri: 'org.useorbit.desktop://auth/callback' }
  expect(desktopAttemptSchema.parse(attempt)).toEqual(attempt)
  for (const state of ['', 'a'.repeat(63), 'a'.repeat(65), 'G'.repeat(64)]) {
    expect(desktopAttemptSchema.safeParse({ ...attempt, state }).success).toBe(false)
  }
  for (const codeChallenge of ['', 'A'.repeat(42), 'A'.repeat(44), '+'.repeat(43)]) {
    expect(desktopAttemptSchema.safeParse({ ...attempt, codeChallenge }).success).toBe(false)
  }
})
