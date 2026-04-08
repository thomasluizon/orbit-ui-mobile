import { describe, expect, it } from 'vitest'
import { buildGoalTitle, isGoalDeadlinePast, parseGoalTargetValue } from '../utils/goal-form'

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
})
