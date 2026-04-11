import { describe, expect, it } from 'vitest'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '../utils/goal-metrics'

describe('goal metrics utils', () => {
  it('formats valid goal metric dates and falls back for invalid values', () => {
    expect(formatGoalMetricsDate('2025-04-11', 'en')).toContain('2025')
    expect(formatGoalMetricsDate('2025-04-11T10:00:00Z', 'pt-BR')).toContain('2025')
    expect(formatGoalMetricsDate('not-a-date', 'en')).toBe('not-a-date')
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

  it('maps adherence rates to tone bands', () => {
    expect(getGoalHabitAdherenceTone(90)).toBe('success')
    expect(getGoalHabitAdherenceTone(60)).toBe('primary')
    expect(getGoalHabitAdherenceTone(50)).toBe('primary')
    expect(getGoalHabitAdherenceTone(10)).toBe('warning')
  })
})
