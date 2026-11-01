import { habitDetailSchema } from '../types/habit'
import type { HabitDetail, HabitScheduleItem, NormalizedHabit } from '../types/habit'

export function makeHabitDetailChild(): HabitDetail['children'][number] {
  return {
    id: 'child-1',
    title: 'Recurring child',
    description: null,
    emoji: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2026-08-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    children: [],
  }
}

export function makeHabitDetail(): Omit<HabitDetail, 'linkedGoals' | 'slipAlertEnabled' | 'tags'> {
  return {
    ...makeHabitDetailChild(),
    id: 'habit-1',
    title: 'Read',
    createdAtUtc: '2026-08-01T12:00:00Z',
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    children: [makeHabitDetailChild()],
  }
}

export function makeHabitScheduleItem(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  const detail = makeHabitDetail()
  return {
    ...detail,
    scheduledDates: ['2026-08-28'],
    isOverdue: false,
    slipAlertEnabled: false,
    tags: [{ id: 'tag-1', name: 'Focus', color: '#123456' }],
    children: [{
      ...makeHabitDetailChild(),
      scheduledDates: ['2026-08-28'],
      isOverdue: false,
      tags: [],
      children: [],
      hasSubHabits: false,
      flexibleTarget: null,
      flexibleCompleted: null,
      isLoggedInRange: false,
      instances: [],
      searchMatches: null,
    }],
    hasSubHabits: true,
    flexibleTarget: null,
    flexibleCompleted: null,
    isLoggedInRange: false,
    linkedGoals: [],
    instances: [],
    searchMatches: null,
    ...overrides,
  }
}

export function makeMonthlyChildDaySchedule(date = '2026-11-01', nextDate = '2026-12-01'): HabitScheduleItem {
  const parent = makeHabitScheduleItem({ frequencyUnit: 'Month', days: [], scheduledDates: [date], dueDate: date })
  const child = parent.children[0]!
  return {
    ...parent,
    children: [
      { ...child, frequencyUnit: 'Month', days: [], dueDate: nextDate, scheduledDates: [], instances: [], isSkippedOnDate: true, isLoggedInRange: false },
      { ...child, id: 'child-2', title: 'Logged expenses', frequencyUnit: 'Month', days: [], dueDate: nextDate,
        scheduledDates: [], isSkippedOnDate: false, isLoggedInRange: true,
        instances: [{ date, status: 'Completed', logId: 'positive-log' }] },
    ],
  }
}

export function makeTaggedNestedHabitScheduleItem(): HabitScheduleItem {
  const item = makeHabitScheduleItem()
  return {
    ...item,
    children: item.children.map((child) => child.id === 'child-1'
      ? { ...child, tags: [{ id: 'tag-child', name: 'Nested focus', color: '#123456' }] }
      : child),
  }
}

export function makeHabitDetailScopedChild(date: string): NormalizedHabit {
  return {
    ...makeHabitDetailChild(),
    createdAtUtc: '2026-08-01T12:00:00Z',
    parentId: 'habit-1',
    scheduledDates: [date],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    isLoggedInRange: true,
    linkedGoals: [],
    instances: [{ date, status: 'Completed', logId: 'child-log' }],
    searchMatches: null,
  }
}

export function makeLoggedGeneralHabitDetailChild(): NormalizedHabit {
  return {
    ...makeHabitDetailScopedChild('2026-08-29'),
    title: 'General child',
    frequencyUnit: null,
    frequencyQuantity: null,
    isCompleted: true,
    isGeneral: true,
    scheduledDates: [],
    isLoggedInRange: false,
    instances: [],
  }
}

export function makeHabitDetailScopedParent(): NormalizedHabit {
  return {
    ...makeHabitDetailScopedChild('2026-08-28'),
    id: 'habit-1',
    title: 'Read',
    parentId: null,
    tags: [{ id: 'tag-1', name: 'Focus', color: '#123456' }],
    linkedGoals: [{ id: 'goal-1', title: 'Read more books' }],
  }
}

export function makeEnrichedHabitDetail(): HabitDetail {
  return habitDetailSchema.parse({
    ...makeHabitDetail(),
    isBadHabit: true,
    linkedGoals: [{ id: 'goal-1', title: 'Read more books' }],
    slipAlertEnabled: true,
    tags: [{ id: 'tag-1', name: 'Focus', color: '#123456' }],
    children: [{
      ...makeHabitDetailChild(),
      tags: [{ id: 'tag-2', name: 'Health', color: '#123456' }],
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [{ when: 'same_day', time: '08:00:00' }],
      relativeReminders: [{ minutesBefore: 30 }],
      slipAlertEnabled: true,
    }],
  })
}
