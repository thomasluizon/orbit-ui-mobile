import { describe, expect, it } from 'vitest'
import { profileSchema } from '../types/profile'
import { validateApiResponse } from '../utils/error-utils'
import profileResponse from './fixtures/profile-api-response.json'

describe('serialized API profile response', () => {
  it('accepts the neutral compatibility fields returned by the production handler', () => {
    const profile = validateApiResponse(profileResponse, profileSchema, '/api/profile')

    expect(profile.publicProfile).toBeNull()
    expect(profile.handle).toBeNull()
    expect(profile.socialOptIn).toBe(false)
    expect(profile.email).toBe(profileResponse.email)
  })

  it('continues accepting an omitted public profile from older responses', () => {
    const { publicProfile: _, ...olderProfile } = profileResponse

    expect(profileSchema.parse(olderProfile).publicProfile).toBeUndefined()
  })

  it.each([
    ['language', 'unsupported-locale'],
    ['plan', 'unsupported-plan'],
    ['subscriptionInterval', 'unsupported-interval'],
    ['subscriptionSource', 'unsupported-source'],
    ['googleCalendarAutoSyncStatus', 'unsupported-status'],
  ])('continues rejecting unknown values for %s', (field, value) => {
    const result = profileSchema.safeParse({ ...profileResponse, [field]: value })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toContainEqual([field])
  })
})
