import { randomUUID } from 'node:crypto'
import type { BrowserContext } from '@playwright/test'
import type { UserCalendar } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitTag } from '@orbit/shared/types/habit'
import { HERMETIC_SESSION_EXPIRES, mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'
import type { SessionFixture } from '../../test-support/hermetic/mock-api/session-fixtures'

interface LayoutSession {
  profile?: Profile
  calendars?: UserCalendar[]
  tags?: HabitTag[]
  fixtureSession?: string
}

const sessions = new WeakMap<BrowserContext, LayoutSession>()

async function writeLayoutSession(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies(['auth_token', 'refresh_token'].map((name) => ({
    name, value: token, domain: '127.0.0.1', path: '/', expires: HERMETIC_SESSION_EXPIRES,
    httpOnly: true, secure: true, sameSite: 'Strict' as const,
  })))
}

async function seedLayoutFixtures(session: string, fixtures: readonly SessionFixture[]): Promise<void> {
  const response = await fetch('http://127.0.0.1:5099/_test/session-fixtures', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${mintHermeticJwt(undefined, undefined, undefined, session)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fixtures }),
  })
  if (response.status !== 204) throw new Error(`Layout fixture seeding failed: ${response.status} ${await response.text()}`)
}

export async function setLayoutProfileSession(context: BrowserContext, profile: Profile, calendars?: UserCalendar[], tags?: HabitTag[]): Promise<void> {
  const fixtureSession = sessions.get(context)?.fixtureSession
  if (fixtureSession) await seedLayoutFixtures(fixtureSession, [{ path: '/api/profile', body: profile }])
  await writeLayoutSession(context, mintHermeticJwt(profile, calendars, tags, fixtureSession))
  sessions.set(context, { profile, calendars, tags, fixtureSession })
}

export async function setLayoutFixtureSession(context: BrowserContext, fixtures: readonly SessionFixture[]): Promise<void> {
  const current = sessions.get(context) ?? {}
  const session = current.fixtureSession ?? randomUUID()
  await seedLayoutFixtures(session, fixtures)
  await writeLayoutSession(context, mintHermeticJwt(current.profile, current.calendars, current.tags, session))
  sessions.set(context, { ...current, fixtureSession: session })
}
