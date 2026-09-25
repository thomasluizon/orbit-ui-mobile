import { describe, it, expect, vi, beforeEach } from 'vitest'
import { API } from '@orbit/shared/api'
import type { ApplyOnboardingRequest } from '@orbit/shared/types/onboarding'

const mockServerAuthMutate = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthMutate: mockServerAuthMutate,
}))

const { applyOnboarding, dismissImportPrompt } = await import('@/lib/actions/onboarding')

describe('onboarding server actions', () => {
  beforeEach(() => {
    mockServerAuthMutate.mockReset()
  })

  it('posts the onboarding payload and returns the apply response', async () => {
    const payload: ApplyOnboardingRequest = { habits: [] }
    mockServerAuthMutate.mockResolvedValue({ appliedHabitCount: 0 })

    const result = await applyOnboarding(payload)

    expect(result).toEqual({ appliedHabitCount: 0 })
    expect(mockServerAuthMutate).toHaveBeenCalledWith(API.profile.onboardingApply, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, null)
  })

  it('dismisses the import prompt with a PUT', async () => {
    mockServerAuthMutate.mockResolvedValue(undefined)
    await dismissImportPrompt()
    expect(mockServerAuthMutate).toHaveBeenCalledWith(API.profile.importPromptDismiss, {
      method: 'PUT',
    }, null)
  })
})
