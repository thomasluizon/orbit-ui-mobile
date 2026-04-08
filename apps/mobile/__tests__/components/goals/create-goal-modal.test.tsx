import { describe, expect, it } from 'vitest'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  parseGoalTargetValue,
} from '@orbit/shared/utils/goal-form'

describe('CreateGoalModal helpers', () => {
  it('parses numeric target values and rejects invalid input', () => {
    expect(parseGoalTargetValue('10')).toBe(10)
    expect(parseGoalTargetValue(' 10.5 ')).toBe(10.5)
    expect(parseGoalTargetValue('')).toBeNull()
    expect(parseGoalTargetValue('abc')).toBeNull()
  })

  it('builds a fallback title when description is empty', () => {
    expect(buildGoalTitle('', '10', 'km')).toBe('10 km')
    expect(buildGoalTitle('Run daily', '10', 'km')).toBe('Run daily')
  })

  it('detects deadlines in the past', () => {
    expect(isGoalDeadlinePast('2025-06-14', '2025-06-15')).toBe(true)
    expect(isGoalDeadlinePast('2025-06-15', '2025-06-15')).toBe(false)
  })
})
