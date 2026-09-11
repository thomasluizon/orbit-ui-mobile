import { describe, expect, it } from 'vitest'
import type { Achievement } from '../types/gamification'
import type { Goal } from '../types/goal'
import {
  achievementGlyphKey,
  buildGoalMovePositions,
  deriveStreakRepairState,
  filterProgressGoals,
  getGoalDeadlinePresentation,
  getGamificationLevelTitleKey,
  getStreakRepairErrorMessageKey,
  visibleProgressAchievements,
} from '../utils/progress'

function goal(id: string, status: Goal['status'], position: number): Goal {
  return {
    id,
    title: id,
    description: null,
    targetValue: 10,
    currentValue: 2,
    unit: 'days',
    status,
    deadline: null,
    position,
    createdAtUtc: '2026-08-01T00:00:00Z',
    completedAtUtc: null,
    progressPercentage: 20,
    linkedHabits: [],
  }
}

function achievement(id: string, category: string): Achievement {
  return {
    id,
    name: id,
    description: id,
    category,
    rarity: 'Common',
    xpReward: 10,
    iconKey: 'target',
    isEarned: false,
    earnedAtUtc: null,
  }
}

describe('progress surface models', () => {
  const goals = [goal('a', 'Active', 0), goal('b', 'Completed', 1), goal('c', 'Abandoned', 2)]

  it('filters one list into the four decided views', () => {
    expect(filterProgressGoals(goals, 'all')).toHaveLength(3)
    expect(filterProgressGoals(goals, 'active').map((item) => item.id)).toEqual(['a'])
    expect(filterProgressGoals(goals, 'completed').map((item) => item.id)).toEqual(['b'])
    expect(filterProgressGoals(goals, 'abandoned').map((item) => item.id)).toEqual(['c'])
  })

  it('writes positions for the entire unfiltered list', () => {
    expect(buildGoalMovePositions(goals, 'c', 0)).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ])
  })

  it('keeps only a confirmed single-day repair offer with a valid API date', () => {
    const now = new Date('2026-08-28T15:00:00Z')
    expect(deriveStreakRepairState({
      streak: {
        currentStreak: 0,
        longestStreak: 4,
        lastActiveDate: null,
        isRepairAvailable: true,
        repairDate: '2026-08-27',
      },
      freezesAvailable: 2,
      banked: 2,
      ceiling: 3,
      now,
      accountTimeZone: 'America/Sao_Paulo',
    })).toMatchObject({ dates: ['2026-08-27'], count: 1, canRepair: true, gapUnavailable: false })
    expect(deriveStreakRepairState({
      streak: {
        currentStreak: 0,
        longestStreak: 4,
        lastActiveDate: null,
        isRepairAvailable: true,
        repairDate: 'not-a-date',
      },
      freezesAvailable: 2,
      banked: 2,
      ceiling: 3,
      now,
      accountTimeZone: 'America/Sao_Paulo',
    })).toMatchObject({ dates: [], count: 0, canRepair: false })
  })

  it('leaves a restarted multi-day gap read-only', () => {
    const now = new Date('2026-08-28T15:00:00Z')
    expect(deriveStreakRepairState({
      streak: {
        currentStreak: 1,
        longestStreak: 4,
        lastActiveDate: '2026-08-28',
        isRepairAvailable: false,
        repairDate: null,
      },
      freezesAvailable: 2,
      banked: 2,
      ceiling: 3,
      now,
      accountTimeZone: 'America/Sao_Paulo',
    })).toMatchObject({ dates: [], count: 0, canRepair: false, showGap: true, gapUnavailable: true })
  })

  it('does not report a gap without the restart signal', () => {
    const now = new Date('2026-08-28T15:00:00Z')
    expect(deriveStreakRepairState({
      streak: {
        currentStreak: 4,
        longestStreak: 9,
        lastActiveDate: null,
        isRepairAvailable: false,
        repairDate: null,
      },
      freezesAvailable: 2,
      banked: 2,
      ceiling: 3,
      now,
      accountTimeZone: 'America/Sao_Paulo',
    })).toMatchObject({ dates: [], showGap: false, gapUnavailable: false })
  })

  it('maps streak repair rate limiting separately from other failures', () => {
    expect(getStreakRepairErrorMessageKey(429)).toBe('progressScreen.streak.repairRateLimited')
    expect(getStreakRepairErrorMessageKey(500)).toBe('progressScreen.streak.repairError')
  })

  it('hides the retired social achievement categories', () => {
    expect(
      visibleProgressAchievements([
        achievement('start', 'GettingStarted'),
        achievement('friends', 'Social'),
        achievement('share', 'Sharing'),
        achievement('together', 'Together'),
      ]).map((item) => item.id),
    ).toEqual(['start'])
  })

  it('maps API achievement icon keys to the shared Tabler vocabulary', () => {
    expect(achievementGlyphKey('goal_setter')).toBe('target')
    expect(achievementGlyphKey('week_warrior')).toBe('flame')
    expect(achievementGlyphKey('first_orbit')).toBe('satellite')
    expect(achievementGlyphKey('unknown_future_key')).toBe('star')
  })

  it('keeps deadline urgency live without reporting it for inactive goals', () => {
    const now = new Date('2026-08-28T15:00:00-03:00')
    expect(getGoalDeadlinePresentation('2026-08-27', 'Active', now)).toEqual({
      days: 1,
      state: 'overdue',
    })
    expect(getGoalDeadlinePresentation('2026-08-28', 'Active', now)).toEqual({
      days: 0,
      state: 'dueToday',
    })
    expect(getGoalDeadlinePresentation('2026-09-02', 'Active', now)).toEqual({
      days: 5,
      state: 'soon',
    })
    expect(getGoalDeadlinePresentation('2026-09-08', 'Active', now)).toEqual({
      days: 11,
      state: 'later',
    })
    expect(getGoalDeadlinePresentation('2026-08-27', 'Completed', now)).toBeNull()
  })

  it('keeps the level 10 title while numeric levels continue', () => {
    expect(getGamificationLevelTitleKey(1)).toBe('progressScreen.achievements.levelTitles.starter')
    expect(getGamificationLevelTitleKey(10)).toBe('progressScreen.achievements.levelTitles.legend')
    expect(getGamificationLevelTitleKey(14)).toBe('progressScreen.achievements.levelTitles.legend')
  })
})
