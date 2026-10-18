import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'
import { habitScheduleItemSchema, type HabitScheduleItem } from '../types/habit'
import { mergeHabitListSchedule } from '../utils/habit-list-schedule'
import { normalizeHabitQueryData } from '../utils/habit-normalization'
import type { HabitVisibilityView } from '../utils/habit-visibility'

export function createHabitViewItems(today: string, view: HabitVisibilityView): HabitScheduleItem[] {
  const tomorrow = new Date(`${today}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const futureDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  const yesterday = new Date(`${today}T12:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  const previousDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  const items = [
    createMockHabitScheduleItem({ id: 'future', title: 'Future', dueDate: futureDate, scheduledDates: [futureDate], position: 0 }),
    createMockHabitScheduleItem({ id: 'parent', title: 'Routine', dueDate: today, scheduledDates: [today], position: 1, hasSubHabits: true, children: [
      createMockHabitScheduleChild({ id: 'future-child', title: 'Later child', dueDate: futureDate, scheduledDates: [futureDate], position: 1 }),
      createMockHabitScheduleChild({ id: 'today-child', title: 'Today child', dueDate: today, scheduledDates: [today], position: 0 }),
    ] }),
    createMockHabitScheduleItem({ id: 'overdue', title: 'Overdue', dueDate: previousDate, scheduledDates: [], instances: [], isOverdue: view === 'today', position: 2 }),
    createMockHabitScheduleItem({ id: 'recurring-done', title: 'Recurring done', dueDate: futureDate, scheduledDates: [futureDate], isCompleted: true, position: 3 }),
    createMockHabitScheduleItem({ id: 'once-done', title: 'Once done', dueDate: today, scheduledDates: [today], frequencyUnit: null, isCompleted: true, position: 4 }),
    createMockHabitScheduleItem({ id: 'general', title: 'Any day', isGeneral: true, dueDate: '', scheduledDates: [], frequencyUnit: null, position: 5, hasSubHabits: true, children: [
      createMockHabitScheduleChild({ id: 'general-child', title: 'Any day child', isGeneral: true, dueDate: '', scheduledDates: [], frequencyUnit: null }),
    ] }),
    createMockHabitScheduleItem({ id: 'general-done', title: 'Any day done', isGeneral: true, dueDate: '', scheduledDates: [], frequencyUnit: null, isCompleted: true, position: 6 }),
  ].map((item) => habitScheduleItemSchema.parse(view === 'all' ? { ...item, isOverdue: false, scheduledDates: [], instances: [], children: item.children.map((child) => ({ ...child, isOverdue: false, scheduledDates: [], instances: [] })) } : item))
  return items.filter((item) => view === 'general'
    ? item.isGeneral
    : view === 'all' || (!item.isGeneral && item.dueDate <= today))
}

export function createHabitViewScheduleItems(today: string): HabitScheduleItem[] {
  return createHabitViewItems(today, 'today').map((item) => ({
    ...item,
    scheduledDates: [today],
    isOverdue: item.id === 'overdue',
    instances: [],
    children: item.children.filter((child) => child.dueDate <= today),
  }))
}

export function createHabitViewFixture(today: string, view: HabitVisibilityView): ReturnType<typeof normalizeHabitQueryData> {
  const items = createHabitViewItems(today, view)
  return normalizeHabitQueryData(view === 'all' ? mergeHabitListSchedule(items, createHabitViewScheduleItems(today)) : items)
}

export function createAppendedGeneralSearchItems(matchesDescendant: boolean): HabitScheduleItem[] {
  const general = { isGeneral: true, frequencyUnit: null, dueDate: '0001-01-01', scheduledDates: [], instances: [], searchMatches: null }
  return [
    createMockHabitScheduleItem({ ...general, id: 'general-unmatched', title: 'Any day', position: 0 }),
    createMockHabitScheduleItem({ ...general, id: 'general-parent', title: 'Someday', position: 1, hasSubHabits: true,
      searchMatches: matchesDescendant ? [{ field: 'child', value: 'Needle child' }] : null,
      children: [
        createMockHabitScheduleChild({ ...general, id: 'general-match', title: 'Needle child', position: 0,
          searchMatches: matchesDescendant ? [{ field: 'title', value: null }] : null }),
        createMockHabitScheduleChild({ ...general, id: 'general-sibling', title: 'Other child', position: 1 }),
      ],
    }),
  ].map((item) => habitScheduleItemSchema.parse(item))
}

export const HABIT_VIEW_ROW_ORDER = {
  today: ['parent', 'today-child', 'overdue'],
  all: ['overdue', 'parent', 'today-child', 'future-child', 'future', 'recurring-done'],
  general: ['general', 'general-child'],
} as const
