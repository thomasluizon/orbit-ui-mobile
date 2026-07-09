import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { UpdateHabitRequest } from '@orbit/shared/types/habit'
import { buildOptimisticHabitPatch } from '@/lib/habit-mutation-helpers'

function buildRequest(overrides: Partial<UpdateHabitRequest> = {}): UpdateHabitRequest {
  return {
    title: 'Read',
    isBadHabit: false,
    ...overrides,
  }
}

describe('buildOptimisticHabitPatch', () => {
  it('always patches the required title and isBadHabit fields', () => {
    const patch = buildOptimisticHabitPatch(
      new QueryClient(),
      buildRequest({ title: 'Meditate', isBadHabit: true }),
    )
    expect(patch.title).toBe('Meditate')
    expect(patch.isBadHabit).toBe(true)
    expect('description' in patch).toBe(false)
  })

  it('copies present optional fields and applies nullish fallbacks', () => {
    const patch = buildOptimisticHabitPatch(
      new QueryClient(),
      buildRequest({
        description: undefined,
        emoji: '🔥',
        days: ['Mon', 'Wed'],
        reminderTimes: undefined,
      }),
    )
    expect(patch.description).toBeNull()
    expect(patch.emoji).toBe('🔥')
    expect(patch.days).toEqual(['Mon', 'Wed'])
    expect(patch.reminderTimes).toEqual([])
  })

  it('resolves goalIds to cached linked goals (empty when uncached)', () => {
    const patch = buildOptimisticHabitPatch(
      new QueryClient(),
      buildRequest({ goalIds: ['g1'] }),
    )
    expect(patch.linkedGoals).toEqual([])
  })

  it('clears the end date when clearEndDate is set', () => {
    const patch = buildOptimisticHabitPatch(
      new QueryClient(),
      buildRequest({ endDate: '2026-12-31', clearEndDate: true }),
    )
    expect(patch.endDate).toBeNull()
  })

  it('wipes schedule fields when the habit becomes general', () => {
    const patch = buildOptimisticHabitPatch(
      new QueryClient(),
      buildRequest({
        isGeneral: true,
        frequencyUnit: 'Week',
        days: ['Mon'],
        reminderEnabled: true,
        dueTime: '09:00',
      }),
    )
    expect(patch.isGeneral).toBe(true)
    expect(patch.frequencyUnit).toBeNull()
    expect(patch.frequencyQuantity).toBeNull()
    expect(patch.days).toEqual([])
    expect(patch.reminderEnabled).toBe(false)
    expect(patch.reminderTimes).toEqual([])
    expect(patch.scheduledReminders).toEqual([])
    expect(patch.dueTime).toBeNull()
    expect(patch.dueEndTime).toBeNull()
    expect(patch.endDate).toBeNull()
  })
})
