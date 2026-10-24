import { z } from 'zod'

export const desktopAttemptSchema = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  redirectUri: z.string(),
})

export function desktopRedirectUri(): string | null {
  switch (process.env.NEXT_PUBLIC_SITE_URL) {
    case 'https://app.useorbit.org': return 'org.useorbit.desktop://auth/callback'
    case 'https://app-staging.useorbit.org': return 'org.useorbit.desktop.staging://auth/callback'
    default: return null
  }
}
