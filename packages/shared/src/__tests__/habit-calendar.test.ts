import { describe, expect, it } from 'vitest'
import {
  buildHabitCalendarDayCells,
  buildHabitCalendarWeekdayKeys,
  buildHabitLogDateSet,
} from '../utils/habit-calendar'

describe('habit-calendar helpers', () => {
  it('rotates weekday keys when the week starts on monday', () => {
    expect(buildHabitCalendarWeekdayKeys(1)).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ])
  })

  it('builds the log date set from habit logs', () => {
    expect(buildHabitLogDateSet([{ date: '2026-01-01' }, { date: '2026-01-02' }])).toEqual(
      new Set(['2026-01-01', '2026-01-02']),
    )
  })

  it('builds day cells for the visible calendar range', () => {
    const cells = buildHabitCalendarDayCells(
      new Date('2026-01-15T00:00:00Z'),
      0,
      new Set(['2026-01-15']),
      new Date('2026-01-15T00:00:00Z'),
    )

    expect(cells.some((cell) => cell.dateStr === '2026-01-15' && cell.isCompleted)).toBe(true)
  })
})
