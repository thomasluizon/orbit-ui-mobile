import type { HabitsFilter, HabitScheduleChild, HabitScheduleItem, PaginatedResponse } from '../types/habit'
import { fetchAllPaginatedItems } from './pagination'

type ScheduleRow = HabitScheduleItem | HabitScheduleChild

export function mergeHabitListSchedule(items: HabitScheduleItem[], schedule: HabitScheduleItem[]): HabitScheduleItem[] {
  const scheduleById = new Map<string, ScheduleRow>()
  function index(rows: ScheduleRow[]) {
    for (const row of rows) {
      scheduleById.set(row.id, row)
      index(row.children)
    }
  }
  index(schedule)

  function enrich<Row extends ScheduleRow>(row: Row): Row {
    const facts = scheduleById.get(row.id)
    return {
      ...row,
      isSkippedOnDate: facts?.isSkippedOnDate,
      ...(facts ? {
        isOverdue: facts.isOverdue,
        scheduledDates: facts.scheduledDates,
        instances: facts.instances,
        isLoggedInRange: facts.isLoggedInRange,
        isCompleted: facts.isCompleted,
        flexibleTarget: facts.flexibleTarget,
        flexibleCompleted: facts.flexibleCompleted,
      } : {}),
      children: row.children.map(enrich),
    }
  }
  return items.map(enrich)
}

export async function loadHabitListSchedule(
  items: HabitScheduleItem[] | Promise<HabitScheduleItem[]>,
  scheduleDate: string | undefined,
  fetchPage: (filters: HabitsFilter) => Promise<PaginatedResponse<HabitScheduleItem>>,
): Promise<HabitScheduleItem[]> {
  const [list, schedule] = await Promise.all([
    items,
    scheduleDate ? fetchAllPaginatedItems<HabitScheduleItem, PaginatedResponse<HabitScheduleItem>>(
      (page) => fetchPage({ dateFrom: scheduleDate, dateTo: scheduleDate, includeOverdue: true, pageSize: 200, page }),
    ) : undefined,
  ])
  return !schedule || list.length === 0 ? list : mergeHabitListSchedule(list, schedule)
}
