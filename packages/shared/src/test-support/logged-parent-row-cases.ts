import { createMockHabit } from '../__tests__/factories'
import { buildHabitDetailChildDateModel } from '../utils/habit-detail-flow'
import type { NormalizedHabit } from '../types/habit'

export const LOGGED_PARENT_TODAY = '2026-09-12'
const TOMORROW = '2026-09-13'
const YESTERDAY = '2026-09-11'

/** One row that web and mobile each render through their own `HabitRow`; both must reach the same logged-parent answer. */
export interface LoggedParentRowCase {
  name: string
  habit: NormalizedHabit
  /** Whether the current view renders sub-habits under the row. A detail child row renders none. */
  hasChildren: boolean
  depth: number
  selectedDate: string
  loggedParent: boolean
  nextDueVisible: boolean
}

function parent(overrides: Partial<NormalizedHabit> = {}): NormalizedHabit {
  return createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, isLoggedInRange: true, dueDate: TOMORROW,
    frequencyUnit: 'Day', frequencyQuantity: 1, scheduledDates: [], ...overrides })
}

/** The detail screen scopes `isCompleted` and `isLoggedInRange` of a child to the selected date. */
function detailChildParent(): NormalizedHabit {
  const scoped = parent({ instances: [{ date: LOGGED_PARENT_TODAY, status: 'Completed', logId: 'log-parent' }] })
  return buildHabitDetailChildDateModel(parent({ isLoggedInRange: false }), scoped, LOGGED_PARENT_TODAY, LOGGED_PARENT_TODAY).habit
}

export const loggedParentRowCases: readonly LoggedParentRowCase[] = [
  { name: 'a list row with its sub-habits in view', habit: parent(), hasChildren: true, depth: 0, selectedDate: LOGGED_PARENT_TODAY, loggedParent: true, nextDueVisible: true },
  { name: 'a detail child row that is itself a parent', habit: detailChildParent(), hasChildren: false, depth: 1, selectedDate: LOGGED_PARENT_TODAY, loggedParent: true, nextDueVisible: true },
  { name: 'a bad parent', habit: parent({ isBadHabit: true }), hasChildren: true, depth: 0, selectedDate: LOGGED_PARENT_TODAY, loggedParent: true, nextDueVisible: true },
  { name: 'a parent on a past date', habit: parent({ dueDate: LOGGED_PARENT_TODAY }), hasChildren: true, depth: 0, selectedDate: YESTERDAY, loggedParent: true, nextDueVisible: false },
  { name: 'a parent whose sub-habits are filtered out of view', habit: parent(), hasChildren: false, depth: 0, selectedDate: LOGGED_PARENT_TODAY, loggedParent: true, nextDueVisible: true },
  { name: 'a logged row with no sub-habits', habit: parent({ hasSubHabits: false }), hasChildren: false, depth: 0, selectedDate: LOGGED_PARENT_TODAY, loggedParent: false, nextDueVisible: false },
  { name: 'a parent with no log', habit: parent({ isLoggedInRange: false }), hasChildren: true, depth: 0, selectedDate: LOGGED_PARENT_TODAY, loggedParent: false, nextDueVisible: false },
]
