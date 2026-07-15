import { test as setup } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { VISUAL_STORAGE_STATE_PATH } from '../support/env'
import { HERMETIC_SESSION_EXPIRES, VISUAL_ORIGIN, mintHermeticJwt } from './hermetic-session'

setup('mint hermetic visual session', () => {
  const token = mintHermeticJwt()

  const sessionCookie = (name: string) => ({
    name,
    value: token,
    domain: '127.0.0.1',
    path: '/',
    expires: HERMETIC_SESSION_EXPIRES,
    httpOnly: true,
    secure: true,
    sameSite: 'Strict' as const,
  })

  const storageState = {
    cookies: [sessionCookie('auth_token'), sessionCookie('refresh_token')],
    origins: [
      {
        origin: VISUAL_ORIGIN,
        localStorage: [{ name: 'orbit_trial_expired_seen', value: '1' }],
      },
    ],
  }

  mkdirSync(dirname(VISUAL_STORAGE_STATE_PATH), { recursive: true })
  writeFileSync(VISUAL_STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))
})
