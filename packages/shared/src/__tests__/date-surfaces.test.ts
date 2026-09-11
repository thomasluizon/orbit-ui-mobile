import { describe, expect, it } from 'vitest'
import type { DayCellWords, ReadOnlyDayCellProps } from '../contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '../utils/date-surfaces'

const words: DayCellWords = {
  none: 'missed',
  partial: 'partial',
  full: 'done',
  notScheduled: 'not scheduled',
  of: 'of',
  today: 'today',
  readOnly: 'read only',
}

function readOnlyCell(overrides: Partial<ReadOnlyDayCellProps> = {}): ReadOnlyDayCellProps {
  return { day: 27, label: 'August 27', words, ...overrides }
}

describe('date surface outcomes', () => {
  it.each([
    [0, 0, 'not-scheduled'],
    [0, 2, 'none'],
    [1, 2, 'partial'],
    [2, 2, 'full'],
  ] as const)('derives %s of %s as %s', (done, scheduled, expected) => {
    expect(resolveDayCellOutcome(readOnlyCell({ done, scheduled }))).toBe(expected)
  })

  it('announces the derived outcome and exact raw counts', () => {
    const props = readOnlyCell({ done: 1, scheduled: 3 })
    const outcome = resolveDayCellOutcome(props)

    expect(buildDayCellAccessibleName(props, outcome)).toBe(
      'August 27, partial 1 of 3, read only',
    )
  })
})
