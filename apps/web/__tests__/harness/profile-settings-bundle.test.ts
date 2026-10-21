import { describe, expect, it } from 'vitest'
import { bundleProfilePreferences, bundleProfileSettings } from '@/__tests__/support/profile-settings-browser'

describe('Profile geometry bundle compilation', () => {
  it.each([
    { surface: 'settings', bundle: bundleProfileSettings },
    { surface: 'preferences', bundle: bundleProfilePreferences },
  ])('compiles the actual $surface composition without a browser', ({ bundle }) => {
    expect(bundle().length).toBeGreaterThan(0)
  })
})
