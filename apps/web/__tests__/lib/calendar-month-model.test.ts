import { describe, expect, it } from 'vitest'
import { buildCalendarDayMap, buildCalendarMonthModel } from '@orbit/shared/utils'
import { createMockHabit } from '../../../../packages/shared/src/__tests__/factories'

describe('calendar family day map and month figures', () => {
  it.each([true, false])('counts an instance-free descendant once, flexible: %s', (isFlexible) => {
    const child = {
      ...createMockHabit({
        id: 'child',
        isFlexible,
        isCompleted: !isFlexible,
        frequencyUnit: isFlexible ? 'Week' : null,
        frequencyQuantity: isFlexible ? 1 : null,
        dueDate: '2026-04-04',
        scheduledDates: isFlexible ? ['2026-04-04', '2026-04-05', '2026-04-06'] : ['2026-04-05'],
        isLoggedInRange: true,
      }),
      children: [],
    }
    const sibling = { ...child, id: 'sibling' }
    const parent = {
      ...createMockHabit({
        scheduledDates: ['2026-04-06'],
        instances: [{ date: '2026-04-06', status: 'Pending', logId: null }],
        hasSubHabits: true,
      }),
      children: [child, sibling],
      linkedGoals: [],
    }
    const log = { id: 'child-log', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T08:00:00Z' }
    const dayMap = buildCalendarDayMap({
      habits: [parent],
      logs: {
        child: [log, { ...log, id: 'duplicate' }, { ...log, id: 'same-day', date: '2026-04-06' }],
        sibling: [log, { ...log, id: 'skip', date: '2026-04-04', value: 0 }],
      },
    }, new Date('2026-04-07T12:00:00'))
    const model = buildCalendarMonthModel(new Date(2026, 3, 1), dayMap, 1, '2026-04-07')

    expect(dayMap.has('2026-04-04')).toBe(false)
    expect(dayMap.get('2026-04-05')).toEqual([expect.objectContaining({ habitId: parent.id, status: 'completed' })])
    expect(dayMap.get('2026-04-06')).toEqual([expect.objectContaining({ habitId: parent.id, status: 'missed' })])
    expect(model.gridDays.find((day) => day.dateStr === '2026-04-05')).toMatchObject({
      completedCount: 1, totalCount: 1, completionRatio: 1,
    })
    expect(model.gridDays.find((day) => day.dateStr === '2026-04-06')).toMatchObject({
      completedCount: 0, totalCount: 1, completionRatio: 0,
    })
    expect(model.monthStats).toEqual({ totalLogs: 1, missed: 1, bestStreak: 1, hasEntries: true })
  })
})
