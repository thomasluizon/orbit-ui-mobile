import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'
import { createPaginatedSchema, habitScheduleItemSchema, type PaginatedResponse, type HabitScheduleItem } from '../types/habit'

interface MoveInventoryFixture {
  source: HabitScheduleItem
  scheduled: HabitScheduleItem[][]
  general: HabitScheduleItem[][]
  response: (url: string) => PaginatedResponse<HabitScheduleItem>
  optionIds: (string | null)[]
}

export function createMoveInventoryFixture(date: string): MoveInventoryFixture {
  const child = (id: string, children: ReturnType<typeof createMockHabitScheduleChild>[] = []) =>
    createMockHabitScheduleChild({ id, title: id, children })
  const source = createMockHabitScheduleItem({ id: 'source', title: 'source' })
  const scheduled = [
    [source, createMockHabitScheduleItem({ id: 'past', title: 'Past destination', dueDate: '2020-01-01', scheduledDates: [] })],
    [
      createMockHabitScheduleItem({ id: 'future', title: 'Future page two', dueDate: '2099-01-01', scheduledDates: [] }),
      createMockHabitScheduleItem({ id: 'branch', title: 'Branch', children: [child('current-parent', [child('nested-source')])] }),
      createMockHabitScheduleItem({ id: 'source', title: 'source', children: [child('hidden-descendant')] }),
      createMockHabitScheduleItem({ id: 'finished-container', title: 'Finished container', isCompleted: true, frequencyUnit: null,
        children: [child('active-descendant')] }),
      createMockHabitScheduleItem({ id: 'finished', title: 'Finished', isCompleted: true, frequencyUnit: null,
        children: [{ ...child('finished-child'), isCompleted: true, frequencyUnit: null }] }),
      createMockHabitScheduleItem({ id: 'completed-recurring', title: 'Completed recurring', isCompleted: true }),
      createMockHabitScheduleItem({ id: 'deep', title: 'Deep', children: [child('deep-1', [child('deep-2', [child('deep-3')])])] }),
    ],
  ]
  const general = [
    [createMockHabitScheduleItem({ id: 'general-one', title: 'General one', isGeneral: true, frequencyUnit: null })],
    [createMockHabitScheduleItem({ id: 'general-two', title: 'General two', isGeneral: true, frequencyUnit: null,
      children: [{ ...child('general-child'), title: 'Ação futura', isGeneral: true, frequencyUnit: null }] })],
  ]
  const pageSchema = createPaginatedSchema(habitScheduleItemSchema)
  const page = (pages: HabitScheduleItem[][], index: number) => pageSchema.parse({
    items: pages[index - 1], page: index, pageSize: 200,
    totalCount: new Set(pages.flat().map((habit) => habit.id)).size, totalPages: pages.length,
  })
  return {
    source, scheduled, general,
    response: (url: string) => {
      const query = new URL(url, 'https://fixture.invalid').searchParams
      if (query.has('dateFrom')) return pageSchema.parse({ items: [{ ...source, scheduledDates: [date] }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1 })
      return page(query.has('isGeneral') ? general : scheduled, Number(query.get('page') ?? 1))
    },
    optionIds: [null, 'source', 'hidden-descendant', 'past', 'future', 'branch', 'current-parent', 'nested-source',
      'finished-container', 'active-descendant', 'completed-recurring', 'deep', 'deep-1', 'deep-2', 'deep-3',
      'general-one', 'general-two', 'general-child'],
  }
}
