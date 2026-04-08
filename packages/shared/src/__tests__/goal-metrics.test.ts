import { describe, expect, it } from 'vitest'
import {
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '../utils/goal-metrics'

describe('goal metrics utils', () => {
  it('maps tracking statuses to labels and tones', () => {
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

  it('maps adherence rates to tone bands', () => {
    expect(getGoalHabitAdherenceTone(90)).toBe('success')
    expect(getGoalHabitAdherenceTone(60)).toBe('primary')
    expect(getGoalHabitAdherenceTone(10)).toBe('warning')
  })
})
