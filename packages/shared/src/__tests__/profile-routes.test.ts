import { describe, expect, it } from 'vitest'
import { getProfileSectionDestination, LEGACY_PROFILE_ROUTES } from '../utils/profile-routes'

describe('profile section routes', () => {
  it('redirects each retired settings route to its current owner', () => {
    expect(LEGACY_PROFILE_ROUTES).toEqual([
      { source: '/preferences', destination: '/profile/preferences' },
      { source: '/advanced', destination: '/profile/astra' },
      { source: '/ai-settings', destination: '/profile/astra' },
    ])
  })

  it('preserves subscription settlement parameters when returning to Astra', () => {
    expect(getProfileSectionDestination('?subscription=success&keep=1', '')).toBe('/profile/astra?subscription=success&keep=1')
  })

  it.each([
    ['#you', '/profile/preferences'],
    ['#astra', '/profile/astra'],
    ['#api-keys', '/profile/astra'],
    ['#notifications', '/profile/notifications'],
    ['#ending', '/profile/account'],
  ])('moves the old %s section to %s', (hash, destination) => {
    expect(getProfileSectionDestination('', hash)).toBe(destination)
    expect(getProfileSectionDestination('?keep=1', hash)).toBe(`${destination}?keep=1`)
  })

  it.each(['', '?subscription=cancel', '?subscription=unknown', '?return=/outside'])('keeps ordinary Perfil visits at the top level (%s)', (search) => {
    expect(getProfileSectionDestination(search, '#unknown')).toBeNull()
  })
})
