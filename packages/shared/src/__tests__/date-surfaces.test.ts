import { describe, expect, it } from 'vitest'
import type { DayCellWords, ReadOnlyDayCellProps } from '../contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '../utils/date-surfaces'

const words: DayCellWords = {
  none: 'missed',
  partial: 'partial',
  full: 'done',
  notScheduled: 'not scheduled',
  unavailable: 'unavailable',
  future: 'future',
  of: 'of',
  today: 'today',
  selected: 'selected',
  readOnly: 'read only',
}

function readOnlyCell(overrides: Partial<ReadOnlyDayCellProps> = {}): ReadOnlyDayCellProps {
  return { day: 27, label: 'August 27', words, ...overrides }
}

describe('date surface outcomes', () => {
  it('keeps unavailable history ahead of completion-derived outcomes', () => {
    const props = readOnlyCell({ outcome: 'unavailable', done: 1, scheduled: 1 })
    const outcome = resolveDayCellOutcome(props)

    expect(outcome).toBe('unavailable')
    expect(buildDayCellAccessibleName(readOnlyCell({ outcome }), outcome)).toBe(
      'August 27, unavailable, read only',
    )
  })

  it('falls back to the not-scheduled wording when unavailable copy is absent', () => {
    const props = readOnlyCell({
      outcome: 'unavailable',
      words: { ...words, unavailable: undefined },
    })

    expect(buildDayCellAccessibleName(props, 'unavailable')).toBe(
      'August 27, not scheduled, read only',
    )
  })
})
