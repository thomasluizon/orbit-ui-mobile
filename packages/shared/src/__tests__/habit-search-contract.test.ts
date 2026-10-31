import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { makeHabitScheduleItem } from '../test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema, type HabitScheduleItem, type PaginatedResponse } from '../types/habit'
import { normalizeHabitQueryData } from '../utils/habit-normalization'

const { GetApiHabitsResponse } = await vi.importActual<{
  GetApiHabitsResponse: z.ZodType<PaginatedResponse<HabitScheduleItem>>
}>('../types/__generated__/api.generated')

const completed = {
  ...makeHabitScheduleItem({
    id: '10000000-0000-4000-8000-000000000001',
    frequencyUnit: null, frequencyQuantity: null, isCompleted: true,
    tags: [], linkedGoals: [], children: [], hasSubHabits: false,
  }),
  completedOn: '2026-09-30', isSkippedOnDate: false,
}

describe('habit search contract', () => {
  it.each([undefined, null, '2026-09-30'])('retains optional nullable completion date %s on roots and descendants', (completedOn) => {
    const child = { ...completed, id: '10000000-0000-4000-8000-000000000002', completedOn, children: [] }
    const response = {
      items: [{ ...completed, completedOn, children: [child] }],
      page: 1, pageSize: 20, totalCount: 1, totalPages: 1,
    }
    const handwritten = createPaginatedSchema(habitScheduleItemSchema).parse(response)
    const generated = GetApiHabitsResponse.parse(response)
    for (const parsed of [handwritten, generated]) {
      expect(parsed.items[0]).toMatchObject({ completedOn, isSkippedOnDate: false })
      expect(parsed.items[0]!.children[0]).toMatchObject({ completedOn, isSkippedOnDate: false })
    }
    const normalized = normalizeHabitQueryData(handwritten.items)
    expect(normalized.topLevelHabits[0]).toMatchObject({ completedOn, isSkippedOnDate: false })
    expect(normalized.habitsById.get(child.id)).toMatchObject({ completedOn, isSkippedOnDate: false })
  })

  it.each([undefined, null, false, true])('retains optional nullable skip state %s', (isSkippedOnDate) => {
    const response = habitScheduleItemSchema.parse({ ...completed, isSkippedOnDate })
    expect(response).toMatchObject({ isSkippedOnDate })
  })

  it('keeps response order within a search page despite conflicting manual positions', () => {
    const items = [
      { ...completed, id: 'recent', position: 2 },
      { ...completed, id: 'older', position: 0, completedOn: '2026-08-01' },
      { ...completed, id: 'unknown', position: 1, completedOn: null },
    ].map((item) => habitScheduleItemSchema.parse(item))
    const normalized = normalizeHabitQueryData(items, { page: 2, totalCount: 23, totalPages: 2 }, 'response')
    expect(normalized.topLevelHabits.map(({ id }) => id)).toEqual(['recent', 'older', 'unknown'])
    expect(normalized).toMatchObject({ currentPage: 2, totalCount: 23, totalPages: 2 })
    expect(normalizeHabitQueryData(items).topLevelHabits.map(({ id }) => id)).toEqual(['older', 'unknown', 'recent'])
  })
})
