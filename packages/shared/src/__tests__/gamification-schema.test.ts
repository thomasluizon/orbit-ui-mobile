import { describe, expect, it } from 'vitest'
import {
  achievementCategorySchema,
  gamificationProfileSchema,
  nextRewardCarrotSchema,
  recapResponseSchema,
  reportEventResponseSchema,
} from '../types/gamification'
import { profileSchema } from '../types/profile'
import { createMockGamificationProfile, createMockProfile } from './factories'

describe('nextRewardCarrotSchema', () => {
  it('parses a Pro carrot with a null teaser', () => {
    const parsed = nextRewardCarrotSchema.parse({
      nextLevel: 11,
      nextLevelTitle: 'Legend',
      xpToNextLevel: 2100,
      proTeaser: null,
    })
    expect(parsed.proTeaser).toBeNull()
  })

  it('parses a free carrot with a locked achievements teaser', () => {
    const parsed = nextRewardCarrotSchema.parse({
      nextLevel: 3,
      nextLevelTitle: 'Orbiter',
      xpToNextLevel: 50,
      proTeaser: { kind: 'achievements', locked: true },
    })
    expect(parsed.proTeaser).toEqual({ kind: 'achievements', locked: true })
  })
})

describe('gamificationProfileSchema', () => {
  it('round-trips a profile carrying the additive gamification fields', () => {
    const profile = createMockGamificationProfile({
      isPro: false,
      achievementsLocked: true,
      achievements: [],
      nextReward: {
        nextLevel: 4,
        nextLevelTitle: 'Navigator',
        xpToNextLevel: 300,
        proTeaser: { kind: 'achievements', locked: true },
      },
    })

    const parsed = gamificationProfileSchema.parse(profile)

    expect(parsed.isPro).toBe(false)
    expect(parsed.achievementsLocked).toBe(true)
    expect(parsed.nextReward.nextLevel).toBe(4)
    expect(parsed.nextReward.proTeaser?.locked).toBe(true)
  })
})

describe('achievementCategorySchema', () => {
  it('accepts the appended Social, Sharing, and Together categories', () => {
    expect(achievementCategorySchema.parse('Social')).toBe('Social')
    expect(achievementCategorySchema.parse('Sharing')).toBe('Sharing')
    expect(achievementCategorySchema.parse('Together')).toBe('Together')
  })
})

describe('reportEventResponseSchema', () => {
  it('round-trips a granted-achievement payload', () => {
    const parsed = reportEventResponseSchema.parse({
      granted: [
        {
          id: 'show_off',
          name: 'Show Off',
          description: 'Share your first card',
          category: 'Sharing',
          rarity: 'Uncommon',
          xpReward: 75,
          iconKey: 'show_off',
          isEarned: true,
          earnedAtUtc: '2026-06-30T00:00:00Z',
        },
      ],
    })

    expect(parsed.granted).toHaveLength(1)
    expect(parsed.granted[0]?.id).toBe('show_off')
  })

  it('parses an empty granted list (idempotent no-op grant)', () => {
    const parsed = reportEventResponseSchema.parse({ granted: [] })
    expect(parsed.granted).toEqual([])
  })
})

describe('profileSchema.canViewGamification', () => {
  it('parses the additive flag', () => {
    const parsed = profileSchema.parse(createMockProfile({ canViewGamification: true }))
    expect(parsed.canViewGamification).toBe(true)
  })

  it('is optional so older API payloads still parse (rollout safety)', () => {
    const { canViewGamification: _omit, ...withoutFlag } = createMockProfile()
    const parsed = profileSchema.parse(withoutFlag)
    expect(parsed.canViewGamification).toBeUndefined()
  })
})

describe('recapResponseSchema', () => {
  it('parses a metrics-only recap with a share deep link', () => {
    const parsed = recapResponseSchema.parse({
      period: 'week',
      shareDeepLink: 'https://app.useorbit.org/r/ABCD2345?recap=week',
      metrics: {
        completionRate: 80,
        totalCompletions: 12,
        totalScheduled: 15,
        activeDays: 5,
        periodDays: 7,
        currentStreak: 7,
        bestStreak: 20,
        badHabitSlips: 0,
        weeklyConsistency: [100, 80, 60, 100, 0, 0, 0],
        topHabits: [
          { name: 'Read', emoji: '📚', completionRate: 100, completedCount: 7, scheduledCount: 7 },
        ],
        needsAttention: [],
      },
    })

    expect(parsed.period).toBe('week')
    expect(parsed.shareDeepLink).toContain('?recap=week')
    expect(parsed.metrics.topHabits).toHaveLength(1)
  })

  it('accepts the full backend period set, including quarter and semester', () => {
    const baseMetrics = {
      completionRate: 0,
      totalCompletions: 0,
      totalScheduled: 0,
      activeDays: 0,
      periodDays: 90,
      currentStreak: 0,
      bestStreak: 0,
      badHabitSlips: 0,
      weeklyConsistency: [0, 0, 0, 0, 0, 0, 0],
      topHabits: [],
      needsAttention: [],
    }

    for (const period of ['week', 'month', 'quarter', 'semester', 'year'] as const) {
      expect(
        recapResponseSchema.parse({
          period,
          shareDeepLink: `https://app.useorbit.org/r/ABCD2345?recap=${period}`,
          metrics: baseMetrics,
        }).period,
      ).toBe(period)
    }
  })

  it('rejects a period outside the backend set', () => {
    expect(() =>
      recapResponseSchema.parse({
        period: 'decade',
        shareDeepLink: 'https://app.useorbit.org/r/ABCD2345?recap=decade',
        metrics: {
          completionRate: 0,
          totalCompletions: 0,
          totalScheduled: 0,
          activeDays: 0,
          periodDays: 90,
          currentStreak: 0,
          bestStreak: 0,
          badHabitSlips: 0,
          weeklyConsistency: [0, 0, 0, 0, 0, 0, 0],
          topHabits: [],
          needsAttention: [],
        },
      }),
    ).toThrow()
  })
})
