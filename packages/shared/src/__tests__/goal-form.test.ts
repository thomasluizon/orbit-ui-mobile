import { describe, expect, it } from 'vitest'
import {
  MAX_GOAL_TITLE_LENGTH,
  MAX_GOAL_UNIT_LENGTH,
} from '../validation/constants'
import {
  goalFormSchema,
  validateGoalForm,
  validateGoalProgressValue,
} from '../validation/goal-form'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  isStreakGoal,
  parseGoalTargetValue,
  validateGoalDraftInput,
  validateGoalProgressInput,
} from '../utils/goal-form'

describe('goal form utils', () => {
  it('parses goal target values', () => {
    expect(parseGoalTargetValue('')).toBeNull()
    expect(parseGoalTargetValue(' 12.5 ')).toBe(12.5)
    expect(parseGoalTargetValue('abc')).toBeNull()
  })

  it('builds a goal title from description or fallback fields', () => {
    expect(buildGoalTitle('Read daily', 10, 'pages')).toBe('Read daily')
    expect(buildGoalTitle('  ', '10', 'pages')).toBe('10 pages')
  })

  it('detects deadline ordering using ISO dates', () => {
    expect(isGoalDeadlinePast('2025-01-01', '2025-01-02')).toBe(true)
    expect(isGoalDeadlinePast('2025-01-02', '2025-01-02')).toBe(false)
  })

  it('validates draft input across title, target, unit, and streak helpers', () => {
    expect(validateGoalDraftInput('', '', '')).toBe('goals.form.titleRequired')
    expect(validateGoalDraftInput('Read daily', '', 'pages')).toBe('goals.form.targetValueRequired')
    expect(validateGoalDraftInput('Read daily', '10', '')).toBe('goals.form.unitRequired')
    expect(validateGoalDraftInput('', 5, 'days')).toBeNull()
    expect(isStreakGoal('Streak')).toBe(true)
    expect(isStreakGoal('Standard')).toBe(false)
  })
})

describe('goal form validation', () => {
  it('applies defaults and trims schema input', () => {
    expect(
      goalFormSchema.parse({
        title: '  Read daily  ',
      }),
    ).toMatchObject({
      title: 'Read daily',
      description: '',
      unit: '',
      deadline: '',
      habitIds: [],
      type: 'Standard',
    })
  })

  it('returns specific validation keys for goal form errors', () => {
    expect(validateGoalForm('', 1, 'pages')).toBe('goals.form.titleRequired')
    expect(validateGoalForm('x'.repeat(MAX_GOAL_TITLE_LENGTH + 1), 1, 'pages')).toBe(
      'goals.form.titleTooLong',
    )
    expect(validateGoalForm('Read daily', 0, 'pages')).toBe('goals.form.targetValueRequired')
    expect(validateGoalForm('Read daily', 2, '')).toBe('goals.form.unitRequired')
    expect(validateGoalForm('Read daily', 2, 'x'.repeat(MAX_GOAL_UNIT_LENGTH + 1))).toBe(
      'goals.form.unitTooLong',
    )
    expect(validateGoalForm('Read daily', 2, 'pages')).toBeNull()
  })

  it('validates progress values from numbers and string input', () => {
    expect(validateGoalProgressValue(undefined)).toBe('goals.form.progressValueInvalid')
    expect(validateGoalProgressValue(Number.NaN)).toBe('goals.form.progressValueInvalid')
    expect(validateGoalProgressValue(-1)).toBe('goals.form.progressValueInvalid')
    expect(validateGoalProgressValue(0)).toBeNull()

    expect(validateGoalProgressInput('')).toBe('goals.form.progressValueInvalid')
    expect(validateGoalProgressInput('abc')).toBe('goals.form.progressValueInvalid')
    expect(validateGoalProgressInput(' 12.5 ')).toBeNull()
    expect(validateGoalProgressInput(3)).toBeNull()
    expect(validateGoalProgressInput(null)).toBe('goals.form.progressValueInvalid')
  })
})
