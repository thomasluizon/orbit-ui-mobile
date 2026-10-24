import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { utf16Length } from '../validation/utf16-length'
import { habitFormSchema } from '../validation/habit-form'
import { goalFormSchema } from '../validation/goal-form'
import {
  MAX_GOAL_DESCRIPTION_LENGTH, MAX_GOAL_TITLE_LENGTH, MAX_GOAL_UNIT_LENGTH,
  MAX_HABIT_DESCRIPTION_LENGTH, MAX_HABIT_EMOJI_LENGTH, MAX_HABIT_TITLE_LENGTH,
} from '../validation/constants'

describe('UTF-16 string bounds', () => {
  it.each(['min', 'max', 'length'] as const)('retains ordinary Zod issues for %s', (bound) => {
    const schema = z.string().check(utf16Length(bound, 2))
    expect(schema.safeParse('😀').success).toBe(true)
    for (const value of ['a', 'a😀']) {
      const expected = z.string()[bound](2).safeParse('a'.repeat(value.length))
      const actual = schema.safeParse(value)
      expect(actual.success).toBe(expected.success)
      if (!actual.success && !expected.success) expect(actual.error.issues).toEqual(expected.error.issues)
    }
  })

  it('keeps the error key and runs after trimming without accepting non-strings', () => {
    const schema = z.string().trim().check(utf16Length('max', 2, 'habits.form.titleTooLong'))
    expect(schema.parse(' 😀 ')).toBe('😀')
    const result = schema.safeParse(' a😀 ')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('habits.form.titleTooLong')
    expect(schema.safeParse(2).success).toBe(false)
    expect(schema.safeParse(null).success).toBe(false)
  })
})

describe('form string limits', () => {
  it.each([
    [habitFormSchema.shape.title, MAX_HABIT_TITLE_LENGTH, 'habits.form.titleTooLong'],
    [habitFormSchema.shape.description, MAX_HABIT_DESCRIPTION_LENGTH, 'habits.form.descriptionTooLong'],
    [habitFormSchema.shape.emoji, MAX_HABIT_EMOJI_LENGTH, 'habits.form.emojiTooLong'],
    [goalFormSchema.shape.title, MAX_GOAL_TITLE_LENGTH, 'goals.form.titleTooLong'],
    [goalFormSchema.shape.description, MAX_GOAL_DESCRIPTION_LENGTH, undefined],
    [goalFormSchema.shape.unit, MAX_GOAL_UNIT_LENGTH, 'goals.form.unitTooLong'],
  ] as const)('counts UTF-16 units at the %i bound', (schema, maximum, message) => {
    expect(schema.safeParse('a'.repeat(maximum - 2) + '😀').success).toBe(true)
    const result = schema.safeParse('a'.repeat(maximum - 1) + '😀')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]).toMatchObject({
      code: 'too_big', origin: 'string', maximum,
      message: message ?? `Too big: expected string to have <=${maximum} characters`,
    })
  })
})
