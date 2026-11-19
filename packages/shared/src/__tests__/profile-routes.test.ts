import { describe, expect, it } from 'vitest'
import { getProfileSectionDestination, LEGACY_PROFILE_ROUTES, PROFILE_STEP_UP_DESTINATIONS } from '../utils/profile-routes'

describe('profile section routes', () => {
  it('redirects each retired settings route to its current owner', () => {
    expect(LEGACY_PROFILE_ROUTES).toEqual([
      { source: '/preferences', destination: '/profile/preferences' },
      { source: '/advanced', destination: '/profile/ai' },
      { source: '/ai-settings', destination: '/profile/ai' },
      { source: '/profile/astra', destination: '/profile/ai' },
    ])
  })

  it('preserves subscription settlement parameters when returning to the AI settings page', () => {
    expect(getProfileSectionDestination('?subscription=success&keep=1', '')).toBe('/profile/ai?subscription=success&keep=1')
  })

  it.each([
    ['#you', '/profile/preferences'],
    ['#ai', '/profile/ai'],
    ['#astra', '/profile/ai'],
    ['#api-keys', '/profile/ai'],
    ['#notifications', '/profile/notifications'],
    ['#ending', '/profile/account'],
  ])('moves the old %s section to %s', (hash, destination) => {
    expect(getProfileSectionDestination('', hash)).toBe(destination)
    expect(getProfileSectionDestination('?keep=1', hash)).toBe(`${destination}?keep=1`)
  })

  it.each(['', '?subscription=cancel', '?subscription=unknown', '?return=/outside'])('keeps ordinary Perfil visits at the top level (%s)', (search) => {
    expect(getProfileSectionDestination(search, '#unknown')).toBeNull()
  })

  it('names the AI settings page at its new slug for the step-up return', () => {
    expect(PROFILE_STEP_UP_DESTINATIONS).toEqual({ keys: { route: '/profile/ai' }, delete: { route: '/profile/account' } })
  })
})
