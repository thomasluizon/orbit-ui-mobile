import { describe, expect, it } from 'vitest'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'
import { createHabitViewItems, createHabitViewScheduleItems } from './habit-view-fixtures'
import { loadHabitListSchedule, mergeHabitListSchedule } from '../utils/habit-list-schedule'
import { normalizeHabitQueryData } from '../utils/habit-normalization'
import { buildHabitDateBuckets } from '../utils/habit-list-progress'
import { canLogHabitOnDate } from '../utils/habit-card-helpers'

const TODAY = '2026-09-12'

describe('Todos schedule facts', () => {
  it('leaves an empty view or a view without a schedule date unchanged without reading a schedule', async () => {
    const fetchPage = async () => { throw new Error('Unexpected schedule request') }
    expect(await loadHabitListSchedule([], TODAY, fetchPage)).toEqual([])
    const items = createHabitViewItems(TODAY, 'general')
    expect(await loadHabitListSchedule(items, undefined, fetchPage)).toEqual(items)
  })

  it('preserves undated membership, metadata and nested order while enriching every matched row', () => {
    const items = createHabitViewItems(TODAY, 'all')
    const schedule = createHabitViewScheduleItems(TODAY)
    const merged = mergeHabitListSchedule(items, schedule)
    expect(merged.map((habit) => habit.id)).toEqual(items.map((habit) => habit.id))
    expect(items.find((habit) => habit.id === 'overdue')).toMatchObject({ isOverdue: false, scheduledDates: [], instances: [] })
    const { habitsById } = normalizeHabitQueryData(merged)
    const overdue = habitsById.get('overdue')!
    expect(overdue.dueDate).toBe('2026-09-11')
    expect(buildHabitDateBuckets([overdue], TODAY)[0]?.key).toBe('__overdue__')
    expect(canLogHabitOnDate(overdue, TODAY, TODAY)).toBe(true)
    expect(canLogHabitOnDate(habitsById.get('today-child')!, TODAY, TODAY)).toBe(true)
    expect(canLogHabitOnDate(habitsById.get('future-child')!, TODAY, TODAY)).toBe(false)
    expect(merged.find((habit) => habit.id === 'parent')?.children.map((child) => child.id)).toEqual(['future-child', 'today-child'])
  })

  it('keeps list search matches and grandchildren absent from the dated subtree', () => {
    const grandchild = createMockHabitScheduleChild({ id: 'grandchild', scheduledDates: [], instances: [], isOverdue: false })
    const child = createMockHabitScheduleChild({ id: 'child', scheduledDates: [], instances: [], isOverdue: false, children: [grandchild] })
    const root = createMockHabitScheduleItem({ id: 'root', searchMatches: [{ field: 'title', value: null }], children: [child] })
    const dated = createMockHabitScheduleItem({ id: 'root', searchMatches: null, children: [{ ...child, isOverdue: true, children: [] }] })
    const [merged] = mergeHabitListSchedule([root], [dated])
    expect(merged?.searchMatches).toEqual(root.searchMatches)
    expect(merged?.children[0]).toMatchObject({ id: 'child', isOverdue: true, children: [grandchild] })
  })

  it('loads every dated page before returning the full undated list', async () => {
    const items = createHabitViewItems(TODAY, 'all')
    const schedule = createHabitViewScheduleItems(TODAY)
    const merged = await loadHabitListSchedule(items, TODAY, async (filters) => {
      const pageItems = filters.page === 1 ? schedule.slice(0, 1) : schedule.slice(1)
      return { items: pageItems, page: filters.page!, pageSize: 200, totalCount: schedule.length, totalPages: 2 }
    })
    expect(merged.find((habit) => habit.id === 'overdue')?.isOverdue).toBe(true)
    expect(merged.find((habit) => habit.id === 'future')?.scheduledDates).toEqual([])
  })

  it('propagates a failed schedule read instead of presenting incomplete facts', async () => {
    await expect(loadHabitListSchedule(createHabitViewItems(TODAY, 'all'), TODAY, async () => {
      throw new Error('Schedule unavailable')
    })).rejects.toThrow('Schedule unavailable')
  })
})
