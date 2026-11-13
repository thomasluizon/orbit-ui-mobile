import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Redirect } from 'expo-router'
import { redirectSystemPath } from '@/app/+native-intent'
import LegacyAiSettingsRedirect from '@/app/profile/astra'

vi.mock('expo-router', () => ({ Redirect: () => null }))

describe('legacy Perfil settings routes', () => {
  it.each(['preferences', 'advanced', 'ai-settings'])('no longer ships the %s screen', (routeName) => {
    expect(existsSync(resolve(process.cwd(), `app/${routeName}.tsx`))).toBe(false)
  })

  it.each([
    ['/preferences', '/profile/preferences'],
    ['/advanced?source=saved', '/profile/ai'],
    ['orbit://ai-settings', '/profile/ai'],
    ['orbit:///preferences', '/profile/preferences'],
    ['https://app.useorbit.org/advanced', '/profile/ai'],
    ['/profile?subscription=success&keep=1', '/profile/ai?subscription=success&keep=1'],
    ['/profile/astra', '/profile/ai'],
    ['orbit://profile/astra', '/profile/ai'],
    ['https://app.useorbit.org/profile/astra?subscription=success', '/profile/ai?subscription=success'],
    ['/profile/astra?notionError=1', '/profile/ai?notionError=1'],
    ['orbit://profile#ai', '/profile/ai'],
    ['orbit://profile#astra', '/profile/ai'],
    ['/profile#api-keys', '/profile/ai'],
    ['orbit://profile#notifications', '/profile/notifications'],
    ['https://app.useorbit.org/profile#ending', '/profile/account'],
  ])('redirects the saved settings link %s to %s', (path, destination) => {
    expect(redirectSystemPath({ path, initial: true })).toBe(destination)
    expect(redirectSystemPath({ path, initial: false })).toBe(destination)
  })

  it.each(['/profile', '/preferencesx', 'orbit://support'])('preserves the current system path %s', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path)
  })

  it('keeps the old AI settings slug as a redirect route for an in-app link from stored data', () => {
    const element = LegacyAiSettingsRedirect()
    expect(element.type).toBe(Redirect)
    expect(element.props).toEqual({ href: '/profile/ai' })
  })
})
