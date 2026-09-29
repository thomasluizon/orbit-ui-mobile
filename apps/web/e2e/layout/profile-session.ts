import type { BrowserContext } from '@playwright/test'
import type { Profile } from '@orbit/shared/types/profile'
import { HERMETIC_SESSION_EXPIRES, mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'

export async function setLayoutProfileSession(context: BrowserContext, profile: Profile): Promise<void> {
  const token = mintHermeticJwt(profile)
  await context.addCookies(['auth_token', 'refresh_token'].map((name) => ({
    name,
    value: token,
    domain: '127.0.0.1',
    path: '/',
    expires: HERMETIC_SESSION_EXPIRES,
    httpOnly: true,
    secure: true,
    sameSite: 'Strict' as const,
  })))
}
