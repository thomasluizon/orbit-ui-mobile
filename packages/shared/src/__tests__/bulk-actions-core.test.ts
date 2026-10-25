import { describe, expect, it } from 'vitest'
import { getBulkActionFailures, isBulkCompletionAllowed } from '../hooks/bulk-actions-core'
import { bulkSkipResultSchema } from '../types/habit'
import { formatAPIDateInTimeZone } from '../utils/dates'

describe('bulk action entry points', () => {
  it('rejects stale-date and read-only actions while allowing today', () => {
    const today = formatAPIDateInTimeZone(new Date(), 'UTC')
    expect(isBulkCompletionAllowed({ selectedDateStr: today, completionReadOnly: false }, today, 'UTC')).toBe(true)
    expect(isBulkCompletionAllowed({ selectedDateStr: today, completionReadOnly: true }, today, 'UTC')).toBe(false)
    expect(isBulkCompletionAllowed({ selectedDateStr: '2000-01-01', completionReadOnly: false }, today, undefined)).toBe(false)
    expect(isBulkCompletionAllowed({ selectedDateStr: '2000-01-01', completionReadOnly: false }, '2000-01-01', 'UTC')).toBe(false)
  })
})

describe('bulk skip failure classification', () => {
  it.each([
    ['CANNOT_SKIP_FUTURE_DATE', 'errors.api.skipFutureDate'],
    ['BEYOND_OVERDUE_WINDOW', 'errors.api.dateTooOld'],
    ['HABIT_NOT_FOUND', 'toast.errors.notFound'],
    ['HABIT_ALREADY_COMPLETED', 'errors.api.habitAlreadyDone'],
    ['HABIT_NOT_YET_DUE', 'errors.api.habitNotYetDue'],
    ['NOT_SCHEDULED_ON_DATE', 'errors.api.habitNotScheduled'],
    ['ALL_INSTANCES_DONE', 'errors.api.habitPeriodDone'],
    ['NOT_FLEXIBLE_HABIT', 'errors.api.skipNotAllowed'],
    ['CANNOT_SKIP_ONE_TIME', 'errors.api.skipNotAllowed'],
  ])('preserves and explains the permanent producer code %s without retrying', (errorCode, reasonKey) => {
    const response = bulkSkipResultSchema.parse({ results: [
      { index: 0, status: 'Failed', habitId: 'habit', error: 'Rejected', errorCode },
    ] })
    expect(response.results[0]?.errorCode).toBe(errorCode)
    expect(getBulkActionFailures(response.results)).toEqual({ retryIds: [], reasonKeys: [reasonKey] })
  })

  it.each(['MUTATION_FAILED', 'CONCURRENT_UPDATE_CONFLICT', 'INTERNAL_SERVER_ERROR', null, undefined, 'UNKNOWN_CODE'])(
    'retains transient or unclassified failures for retry: %s', (errorCode) => {
      expect(getBulkActionFailures([
        { status: 'Failed', habitId: 'retry', errorCode },
        { status: 'Success', habitId: 'success', errorCode },
      ])).toEqual({ retryIds: ['retry'], reasonKeys: [] })
    },
  )

  it('deduplicates repeated permanent reasons and retry rows', () => {
    expect(getBulkActionFailures([
      { status: 'Failed', habitId: 'a', errorCode: 'HABIT_NOT_YET_DUE' },
      { status: 'Failed', habitId: 'b', errorCode: 'HABIT_NOT_YET_DUE' },
      { status: 'Failed', habitId: 'c' },
      { status: 'Failed', habitId: 'c' },
    ])).toEqual({ retryIds: ['c'], reasonKeys: ['errors.api.habitNotYetDue'] })
  })
})
