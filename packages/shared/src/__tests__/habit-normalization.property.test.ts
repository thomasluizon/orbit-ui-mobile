import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { fallbackChildOverdue } from '../utils/habit-normalization'

const PROPERTY_PARAMS = { seed: 424242, numRuns: 100 } as const

const isoDateArb = fc
  .date({
    min: new Date(Date.UTC(2000, 0, 1)),
    max: new Date(Date.UTC(2100, 11, 31)),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString().slice(0, 10))

const childArb = fc.record({
  isCompleted: fc.boolean(),
  frequencyUnit: fc.constantFrom(null, 'Day', 'Week', 'Month', 'Year'),
  dueDate: isoDateArb,
})

describe('fallbackChildOverdue (properties)', () => {
  test.prop({ child: childArb, todayStr: isoDateArb }, PROPERTY_PARAMS)(
    'is never overdue when the due date is today or in the future',
    ({ child, todayStr }) => {
      fc.pre(child.dueDate >= todayStr)
      expect(fallbackChildOverdue(child, todayStr)).toBe(false)
    },
  )

  test.prop({ child: childArb, todayStr: isoDateArb }, PROPERTY_PARAMS)(
    'is true exactly when the child is incomplete, one-time, and past due',
    ({ child, todayStr }) => {
      const expected = !child.isCompleted && !child.frequencyUnit && child.dueDate < todayStr
      expect(fallbackChildOverdue(child, todayStr)).toBe(expected)
    },
  )
})
