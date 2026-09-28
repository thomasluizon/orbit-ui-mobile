import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redirectSystemPath } from '@/app/+native-intent'

describe('legacy Perfil settings routes', () => {
  it.each(['preferences', 'advanced', 'ai-settings'])('no longer ships the %s screen', (routeName) => {
    expect(existsSync(resolve(process.cwd(), `app/${routeName}.tsx`))).toBe(false)
  })

  it.each([
    '/preferences',
    '/advanced?source=saved',
    'orbit://ai-settings',
    'orbit:///preferences',
    'https://app.useorbit.org/advanced',
  ])('redirects the saved settings link %s to Perfil', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/profile')
  })

  it.each(['/profile', '/preferencesx', 'orbit://support'])('preserves the current system path %s', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path)
  })
})
