import { describe, expect, it } from 'vitest'
import {
  formatGoalHistoryNumber,
  formatGoalMetricsDate,
  getGoalMetricsStatusPresentation,
} from '../utils/goal-metrics'

describe('goal metrics utils', () => {
  it('formats valid goal metric dates and falls back for invalid values', () => {
    expect(formatGoalMetricsDate('2025-04-11', 'en')).toContain('2025')
    expect(formatGoalMetricsDate('2025-04-11T10:00:00Z', 'pt-BR')).toContain('2025')
    expect(formatGoalMetricsDate('not-a-date', 'en')).toBe('not-a-date')
  })

  it('preserves small goal history values in both locales', () => {
    expect(formatGoalHistoryNumber(0.0001, 'en')).toBe('0.0001')
    expect(formatGoalHistoryNumber(0.0002, 'pt-BR')).toBe('0,0002')
    expect(formatGoalHistoryNumber(0.0001, 'en', true)).toBe('+0.0001')
    expect(formatGoalHistoryNumber(-0.0001, 'pt-BR', true)).toBe('-0,0001')
    expect(formatGoalHistoryNumber(Number.MIN_VALUE, 'en')).not.toBe('0')
  })

  it('maps tracking statuses to labels and tones', () => {
    expect(getGoalMetricsStatusPresentation('on_track')).toEqual({
      labelKey: 'goals.metrics.onTrack',
      tone: 'success',
    })
    expect(getGoalMetricsStatusPresentation('at_risk')).toEqual({
      labelKey: 'goals.metrics.atRisk',
      tone: 'warning',
    })
    expect(getGoalMetricsStatusPresentation('behind')).toEqual({
      labelKey: 'goals.metrics.behind',
      tone: 'danger',
    })
    expect(getGoalMetricsStatusPresentation('no_deadline')).toEqual({
      labelKey: 'goals.metrics.noDeadline',
      tone: 'muted',
    })
    expect(getGoalMetricsStatusPresentation('unknown')).toBeNull()
  })
})
