import { describe, expect, it } from 'vitest'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'

describe('GoalMetricsPanel helpers', () => {
  it('maps goal status tones to badge presentations', () => {
    expect(getGoalMetricsStatusPresentation('on_track')).toEqual({
      labelKey: 'goals.metrics.onTrack',
      tone: 'success',
    })
    expect(getGoalMetricsStatusPresentation('no_deadline')).toEqual({
      labelKey: 'goals.metrics.noDeadline',
      tone: 'muted',
    })
    expect(getGoalMetricsStatusPresentation('unknown')).toBeNull()
  })

  it('maps adherence percentages to tones', () => {
    expect(getGoalHabitAdherenceTone(90)).toBe('success')
    expect(getGoalHabitAdherenceTone(60)).toBe('primary')
    expect(getGoalHabitAdherenceTone(10)).toBe('warning')
  })

  it('formats metric dates consistently', () => {
    expect(formatGoalMetricsDate('2025-06-15T00:00:00Z', 'en')).toBe('Jun 15, 2025')
  })
})
