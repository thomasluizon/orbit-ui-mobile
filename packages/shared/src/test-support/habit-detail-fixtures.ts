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

export function makeHabitDetail(): HabitDetail {
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
