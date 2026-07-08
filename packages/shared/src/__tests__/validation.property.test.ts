import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { habitFormSchema } from '../validation/habit-form'
import { goalFormSchema } from '../validation/goal-form'

const PROPERTY_PARAMS = { seed: 424242, numRuns: 100 } as const

function paddedTextArb(maxCore: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.string({ minLength: 1, maxLength: maxCore }).filter((core) => core.trim().length > 0),
      fc.nat({ max: 3 }),
      fc.nat({ max: 3 }),
    )
    .map(([core, left, right]) => `${' '.repeat(left)}${core}${' '.repeat(right)}`)
}

const habitInputArb = fc.record(
  {
    title: paddedTextArb(40),
    description: fc.string({ maxLength: 30 }),
    emoji: fc.string({ maxLength: 10 }),
    days: fc.array(fc.string({ maxLength: 5 }), { maxLength: 3 }),
    isBadHabit: fc.boolean(),
    isGeneral: fc.boolean(),
    isFlexible: fc.boolean(),
    dueDate: fc.string({ maxLength: 10 }),
    dueTime: fc.string({ maxLength: 5 }),
    reminderEnabled: fc.boolean(),
    slipAlertEnabled: fc.boolean(),
  },
  { requiredKeys: ['title'] },
)

const goalInputArb = fc.record(
  {
    title: paddedTextArb(40),
    description: fc.string({ maxLength: 30 }),
    targetValue: fc.oneof(fc.integer({ min: 1, max: 1_000_000 }), fc.constant(null)),
    unit: paddedTextArb(20),
    deadline: fc.string({ maxLength: 10 }),
    habitIds: fc.array(fc.string({ maxLength: 8 }), { maxLength: 3 }),
    type: fc.constantFrom('Standard', 'Streak'),
  },
  { requiredKeys: ['title'] },
)

describe('habitFormSchema (properties)', () => {
  test.prop([habitInputArb], PROPERTY_PARAMS)(
    're-parsing a parsed habit form is a fixed point',
    (input) => {
      const once = habitFormSchema.parse(input)
      const twice = habitFormSchema.parse(once)
      expect(twice).toEqual(once)
    },
  )
})

describe('goalFormSchema (properties)', () => {
  test.prop([goalInputArb], PROPERTY_PARAMS)(
    're-parsing a parsed goal form is a fixed point',
    (input) => {
      const once = goalFormSchema.parse(input)
      const twice = goalFormSchema.parse(once)
      expect(twice).toEqual(once)
    },
  )
})
