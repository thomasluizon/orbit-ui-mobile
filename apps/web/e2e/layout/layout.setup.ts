import { test as setup } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { LAYOUT_ORIGIN, LAYOUT_STORAGE_STATE_PATH } from '../support/env'
import { HERMETIC_SESSION_EXPIRES, mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'

setup('mint hermetic layout session', () => {
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
    origins: [{
      origin: LAYOUT_ORIGIN,
      localStorage: [{ name: 'orbit_trial_expired_seen', value: '1' }],
    }],
  }
  mkdirSync(dirname(LAYOUT_STORAGE_STATE_PATH), { recursive: true })
  writeFileSync(LAYOUT_STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))
})
