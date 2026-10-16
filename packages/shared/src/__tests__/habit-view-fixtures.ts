import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'
import { habitScheduleItemSchema } from '../types/habit'
import { normalizeHabitQueryData } from '../utils/habit-normalization'
import type { HabitVisibilityView } from '../utils/habit-visibility'

export function createHabitViewFixture(today: string, view: HabitVisibilityView): ReturnType<typeof normalizeHabitQueryData> {
  const tomorrow = new Date(`${today}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const futureDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  const items = [
    createMockHabitScheduleItem({ id: 'future', title: 'Future', dueDate: futureDate, scheduledDates: [futureDate], position: 0 }),
    createMockHabitScheduleItem({ id: 'parent', title: 'Routine', dueDate: today, scheduledDates: [today], position: 1, hasSubHabits: true, children: [
      createMockHabitScheduleChild({ id: 'future-child', title: 'Later child', dueDate: futureDate, scheduledDates: [futureDate], position: 1 }),
      createMockHabitScheduleChild({ id: 'today-child', title: 'Today child', dueDate: today, scheduledDates: [today], position: 0 }),
    ] }),
    createMockHabitScheduleItem({ id: 'overdue', title: 'Overdue', dueDate: '2025-01-01', scheduledDates: ['2025-01-01'], isOverdue: true, position: 2 }),
    createMockHabitScheduleItem({ id: 'recurring-done', title: 'Recurring done', dueDate: futureDate, scheduledDates: [futureDate], isCompleted: true, position: 3 }),
    createMockHabitScheduleItem({ id: 'once-done', title: 'Once done', dueDate: today, scheduledDates: [today], frequencyUnit: null, isCompleted: true, position: 4 }),
    createMockHabitScheduleItem({ id: 'general', title: 'Any day', isGeneral: true, dueDate: '', scheduledDates: [], frequencyUnit: null, position: 5, hasSubHabits: true, children: [
      createMockHabitScheduleChild({ id: 'general-child', title: 'Any day child', isGeneral: true, dueDate: '', scheduledDates: [], frequencyUnit: null }),
    ] }),
    createMockHabitScheduleItem({ id: 'general-done', title: 'Any day done', isGeneral: true, dueDate: '', scheduledDates: [], frequencyUnit: null, isCompleted: true, position: 6 }),
  ].map((item) => habitScheduleItemSchema.parse(item))
  return normalizeHabitQueryData(items.filter((item) => view === 'general'
    ? item.isGeneral
    : view === 'all' || (!item.isGeneral && item.dueDate <= today)))
}

export const HABIT_VIEW_ROW_ORDER = {
  today: ['parent', 'today-child', 'overdue'],
  all: ['overdue', 'parent', 'today-child', 'future-child', 'future', 'recurring-done'],
  general: ['general', 'general-child'],
} as const
