import { describe, expect, it } from 'vitest'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  parseGoalTargetValue,
} from '@orbit/shared/utils/goal-form'

describe('EditGoalModal helpers', () => {
  it('keeps the written description when editing a goal', () => {
    expect(buildGoalTitle('Run daily', '12', 'km')).toBe('Run daily')
  })

  it('normalizes edited numeric values', () => {
    expect(parseGoalTargetValue('12')).toBe(12)
    expect(parseGoalTargetValue(' 12 ')).toBe(12)
  })

  it('treats future deadlines as valid', () => {
    expect(isGoalDeadlinePast('2025-06-16', '2025-06-15')).toBe(false)
  })
})
