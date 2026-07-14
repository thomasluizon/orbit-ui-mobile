import { describe, it, expect, vi, beforeEach } from 'vitest'
import { API } from '@orbit/shared/api'
import type { ApplyOnboardingRequest } from '@orbit/shared/types/onboarding'

const mockServerAuthFetch = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: mockServerAuthFetch,
}))

const { applyOnboarding, dismissImportPrompt } = await import('@/app/actions/onboarding')

describe('onboarding server actions', () => {
  beforeEach(() => {
    mockServerAuthFetch.mockReset()
  })

  it('posts the onboarding payload and returns the apply response', async () => {
    const payload: ApplyOnboardingRequest = { habits: [] }
    mockServerAuthFetch.mockResolvedValue({ appliedHabitCount: 0 })

    const result = await applyOnboarding(payload)

    expect(result).toEqual({ appliedHabitCount: 0 })
    expect(mockServerAuthFetch).toHaveBeenCalledWith(API.profile.onboardingApply, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  })

  it('dismisses the import prompt with a PUT', async () => {
    mockServerAuthFetch.mockResolvedValue(undefined)
    await dismissImportPrompt()
    expect(mockServerAuthFetch).toHaveBeenCalledWith(API.profile.importPromptDismiss, {
      method: 'PUT',
    })
  })
})
