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
      profile: createMockGamificationProfile({
        currentStreak: 0, longestStreak: 0, totalXp: 0, achievementsEarned: 0,
      }),
    },
    canView: true,
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

  it.each(['isError', 'isLoading'] as const)(
    'ignores gamification %s when access is disabled', (flag) => {
      const input = readyProgress()
      input.canView = false
      input.gamification[flag] = true

      expect(deriveProgressViewState(input)).toEqual({ error: false, loading: false, empty: true })
    },
  )

  it.each([false, true])('shows empty zero progress with canView=%s', (canView) => {
    expect(deriveProgressViewState({ ...readyProgress(), canView }))
      .toEqual({ error: false, loading: false, empty: true })
  })

  it.each([false, true])('consults earned progress only with canView=%s', (canView) => {
    const input = readyProgress()
    input.canView = canView
    input.gamification.profile.achievementsEarned = 1

    expect(deriveProgressViewState(input)).toEqual({ error: false, loading: false, empty: !canView })
  })
})
