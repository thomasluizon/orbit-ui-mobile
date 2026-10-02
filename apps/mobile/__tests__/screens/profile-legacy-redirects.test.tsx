import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redirectSystemPath } from '@/app/+native-intent'

describe('legacy Perfil settings routes', () => {
  it.each(['preferences', 'advanced', 'ai-settings'])('no longer ships the %s screen', (routeName) => {
    expect(existsSync(resolve(process.cwd(), `app/${routeName}.tsx`))).toBe(false)
  })

  it.each([
    ['/preferences', '/profile/preferences'],
    ['/advanced?source=saved', '/profile/astra'],
    ['orbit://ai-settings', '/profile/astra'],
    ['orbit:///preferences', '/profile/preferences'],
    ['https://app.useorbit.org/advanced', '/profile/astra'],
    ['/profile?subscription=success&keep=1', '/profile/astra?subscription=success&keep=1'],
    ['orbit://profile#notifications', '/profile/notifications'],
    ['https://app.useorbit.org/profile#ending', '/profile/account'],
  ])('redirects the saved settings link %s to %s', (path, destination) => {
    expect(redirectSystemPath({ path, initial: true })).toBe(destination)
    expect(redirectSystemPath({ path, initial: false })).toBe(destination)
  })

  it.each(['/profile', '/preferencesx', 'orbit://support'])('preserves the current system path %s', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path)
  })
})
