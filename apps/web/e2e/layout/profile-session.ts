import type { BrowserContext } from '@playwright/test'
import type { UserCalendar } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitTag } from '@orbit/shared/types/habit'
import { HERMETIC_SESSION_EXPIRES, mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'

export async function setLayoutProfileSession(context: BrowserContext, profile: Profile, calendars?: UserCalendar[], tags?: HabitTag[]): Promise<void> {
  const token = mintHermeticJwt(profile, calendars, tags)
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
