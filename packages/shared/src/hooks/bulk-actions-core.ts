import type { BulkMoveHabitParentResult, NormalizedHabit } from '../types/habit'
import { formatAPIDateInTimeZone } from '../utils/dates'
import { getFriendlyErrorKey } from '../utils/error-utils'
import { getTodayBoundary } from '../utils/today-date'
import type { HabitResolution } from '../utils/habit-list-progress'

export interface BulkActionsOptions {
  selectedHabitIds: Set<string>
  selectedDateStr: string
  completionReadOnly: boolean
  accountTimeZone?: string | null
  habitsById: Map<string, NormalizedHabit>
  habitListRef: { current: { settleBulkHabitResolutions: (resolutions: readonly HabitResolution[], date: string) => void } | null }
  onSuccess: () => void
  onPartialFailure: (failedIds: string[]) => void
}

export interface BulkResultItem { status: string; habitId: string; errorCode?: string | null }

const permanentBulkErrorCodes = new Set([
  'CANNOT_SKIP_FUTURE_DATE', 'BEYOND_OVERDUE_WINDOW', 'HABIT_NOT_FOUND',
  'HABIT_ALREADY_COMPLETED', 'HABIT_NOT_YET_DUE', 'NOT_SCHEDULED_ON_DATE',
  'ALL_INSTANCES_DONE', 'NOT_FLEXIBLE_HABIT', 'CANNOT_SKIP_ONE_TIME',
])

export function getBulkActionFailures(results: readonly BulkResultItem[]): { retryIds: string[]; reasonKeys: string[] } {
  const retryIds = new Set<string>()
  const reasonKeys = new Set<string>()
  for (const result of results) {
    if (result.status !== 'Failed') continue
    if (result.errorCode && permanentBulkErrorCodes.has(result.errorCode)) {
      reasonKeys.add(getFriendlyErrorKey(result, 'common.error'))
    } else {
      retryIds.add(result.habitId)
    }
  }
  return { retryIds: [...retryIds], reasonKeys: [...reasonKeys] }
}

export function isBulkCompletionAllowed(
  currentPermission: { completionReadOnly: boolean; selectedDateStr: string },
  date: string,
  accountTimeZone: string | null | undefined,
): boolean {
  if (currentPermission.completionReadOnly || currentPermission.selectedDateStr !== date) return false
  return accountTimeZone === undefined || getTodayBoundary(date, formatAPIDateInTimeZone(new Date(), accountTimeZone)) !== 'read-only'
}

export function getFailedBulkHabitIds(results: readonly { status: string; habitId: string }[]): string[] {
  return results.flatMap((result) => result.status === 'Failed' ? [result.habitId] : [])
}

export interface BulkMoveParentCallbacks {
  mutate: (input: { habitIds: string[]; parentId: string | null }) => Promise<BulkMoveHabitParentResult>
  getAccountGeneration: () => number
  onSuccess: () => void
  onPartialFailure: (failedIds: string[]) => void
}

export async function executeBulkMoveParent(
  habitIds: string[],
  parentId: string | null,
  { mutate, getAccountGeneration, onSuccess, onPartialFailure }: BulkMoveParentCallbacks,
): Promise<BulkMoveHabitParentResult | undefined> {
  const generation = getAccountGeneration()
  const result = await mutate({ habitIds, parentId })
  if (getAccountGeneration() !== generation) return
  const failedIds = getFailedBulkHabitIds(result.results)
  if (failedIds.length > 0) onPartialFailure(failedIds)
  else onSuccess()
  return result
}
