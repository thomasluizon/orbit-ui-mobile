import { describe, expect, it } from 'vitest'
import { normalizeGoalQueryData } from '../utils/goal-query'

describe('normalizeGoalQueryData', () => {
  it('indexes and sorts goals by position', () => {
    const result = normalizeGoalQueryData([
      {
        id: 'goal-2',
        title: 'Second',
        description: null,
        status: 'Active',
        targetValue: 10,
        currentValue: 2,
        unit: 'sessions',
        deadline: null,
        completedAtUtc: null,
        progressPercentage: 20,
        position: 2,
        linkedHabits: [],
        createdAtUtc: '2026-01-02T00:00:00Z',
      },
      {
        id: 'goal-1',
        title: 'First',
        description: null,
        status: 'Active',
        targetValue: 5,
        currentValue: 1,
        unit: 'sessions',
        deadline: null,
        completedAtUtc: null,
        progressPercentage: 20,
        position: 0,
        linkedHabits: [],
        createdAtUtc: '2026-01-01T00:00:00Z',
      },
    ])

    expect(result.goalsById.get('goal-1')?.title).toBe('First')
    expect(result.allGoals.map((goal) => goal.id)).toEqual(['goal-1', 'goal-2'])
    expect(result.totalCount).toBe(2)
    expect(result.totalPages).toBe(1)
    expect(result.currentPage).toBe(1)
  })
})
