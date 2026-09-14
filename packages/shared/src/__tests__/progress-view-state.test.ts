import { describe, expect, it } from 'vitest'
import { deriveProgressViewState } from '../utils/progress'
import { createMockGamificationProfile, createMockProfile } from './factories'

function readyProgress() {
  return {
    goalCount: 0,
    account: { isLoading: false, isError: false, profile: createMockProfile() },
    goals: { isLoading: false, isError: false },
    gamification: {
      isLoading: false,
      isError: false,
      error: null as unknown,
      profile: createMockGamificationProfile({
        currentStreak: 0, longestStreak: 0, totalXp: 0, achievementsEarned: 0,
      }),
    },
  }
}

describe('deriveProgressViewState', () => {
  it.each(['account', 'goals', 'gamification'] as const)(
    '%s error outranks another loading resource', (resource) => {
      const input = readyProgress()
      input[resource].isError = true
      input[resource === 'account' ? 'goals' : 'account'].isLoading = true

      expect(deriveProgressViewState(input)).toEqual({ error: true, loading: false, empty: false })
    },
  )

  it.each(['account', 'goals', 'gamification'] as const)(
    '%s loading prevents the empty state', (resource) => {
      const input = readyProgress()
      input[resource].isLoading = true

      expect(deriveProgressViewState(input)).toEqual({ error: false, loading: true, empty: false })
    },
  )

  it('treats a pay-gate refusal as locked instead of failed', () => {
    const input = readyProgress()
    input.gamification.isError = true
    input.gamification.error = {
      status: 403,
      data: { error: 'Gamification is a Pro feature. Upgrade to unlock!', errorCode: 'PAY_GATE' },
    }

    expect(deriveProgressViewState(input)).toEqual({ error: false, loading: false, empty: true })
  })

  it('consults earned progress from an available gamification profile', () => {
    const input = readyProgress()
    input.gamification.profile.achievementsEarned = 1

    expect(deriveProgressViewState(input)).toEqual({ error: false, loading: false, empty: false })
  })
})
