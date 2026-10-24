import { describe, expect, it } from 'vitest'
import { isBulkCompletionAllowed } from '../hooks/bulk-actions-core'
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
