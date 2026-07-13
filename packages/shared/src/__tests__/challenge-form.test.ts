import { describe, expect, it } from 'vitest'
import {
  CHALLENGE_TYPE_OPTIONS,
  createChallengeFormSchema,
} from '../validation/challenge-form'

describe('create challenge form validation', () => {
  it('exposes the selectable challenge types in order', () => {
    expect(CHALLENGE_TYPE_OPTIONS).toEqual(['CoopGoal', 'StreakTogether'])
  })

  it('accepts a StreakTogether without a target or end date', () => {
    const result = createChallengeFormSchema.safeParse({
      type: 'StreakTogether',
      title: 'Read daily',
    })
    expect(result.success).toBe(true)
  })

  it('trims the title and requires it to be non-empty', () => {
    expect(
      createChallengeFormSchema.safeParse({ type: 'StreakTogether', title: '   ' }).success,
    ).toBe(false)
  })

  it('requires a positive-integer target and an end date for CoopGoal', () => {
    const result = createChallengeFormSchema.safeParse({
      type: 'CoopGoal',
      title: 'Run together',
      targetCount: '0',
      periodEndUtc: '',
    })
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
    expect(paths).toContain('targetCount')
    expect(paths).toContain('periodEndUtc')
  })

  it('accepts a fully specified CoopGoal', () => {
    const result = createChallengeFormSchema.safeParse({
      type: 'CoopGoal',
      title: 'Run together',
      targetCount: '30',
      periodEndUtc: '2026-12-31',
    })
    expect(result.success).toBe(true)
  })
})
