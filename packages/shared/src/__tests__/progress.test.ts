import { describe, expect, it } from 'vitest'
import type { Achievement } from '../types/gamification'
import type { Goal } from '../types/goal'
import {
  achievementGlyphKey,
  buildGoalMovePositions,
  filterProgressGoals,
  getGoalDeadlinePresentation,
  isRepairableStreakGap,
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

  it('recognizes only the one-day repair window after local yesterday', () => {
    const now = new Date('2026-08-28T15:00:00-03:00')
    expect(isRepairableStreakGap('2026-08-26', 8, now)).toBe(true)
    expect(isRepairableStreakGap('2026-08-25', 8, now)).toBe(false)
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
})
