import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  nextVoiceBars,
  publishComposerVoiceLevel,
  pushVoiceBar,
  subscribeComposerRecordingTime,
  subscribeComposerVoiceLevel,
  voiceBarCount,
  voiceBarScale,
  voiceLevelFromRms,
} from '../hooks/composer-recording-core'

describe('subscribeComposerRecordingTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => vi.useRealTimers())

  it('reports whole elapsed seconds with padded minutes through a minute rollover', () => {
    const elapsed: string[] = []
    const unsubscribe = subscribeComposerRecordingTime((time) => elapsed.push(time))
    expect(elapsed).toEqual([])
    vi.advanceTimersByTime(999)
    expect(elapsed).toEqual([])
    vi.advanceTimersByTime(1)
    expect(elapsed).toEqual(['00:01'])
    vi.advanceTimersByTime(59000)
    expect(elapsed.slice(-2)).toEqual(['00:59', '01:00'])
    vi.advanceTimersByTime(5000)
    expect(elapsed.at(-1)).toBe('01:05')
    unsubscribe()
  })

  it('uses wall-clock elapsed time when the interval is delayed', () => {
    const elapsed: string[] = []
    const unsubscribe = subscribeComposerRecordingTime((time) => elapsed.push(time))
    vi.setSystemTime(124500)
    vi.advanceTimersByTime(1000)
    expect(elapsed).toEqual(['02:05'])
    unsubscribe()
  })

  it('stops delivering time after cleanup and starts a new recording from zero', () => {
    const first: string[] = []
    const second: string[] = []
    const unsubscribe = subscribeComposerRecordingTime((time) => first.push(time))
    vi.advanceTimersByTime(2000)
    unsubscribe()
    unsubscribe()
    vi.advanceTimersByTime(60000)
    expect(first).toEqual(['00:01', '00:02'])
    const stopSecond = subscribeComposerRecordingTime((time) => second.push(time))
    vi.advanceTimersByTime(1000)
    expect(second).toEqual(['00:01'])
    expect(first).toEqual(['00:01', '00:02'])
    stopSecond()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('composer voice level', () => {
  it('maps RMS to a perceived level from 0 to 1', () => {
    expect(voiceLevelFromRms(0)).toBe(0)
    expect(voiceLevelFromRms(Number.NaN)).toBe(0)
    expect(voiceLevelFromRms(0.05)).toBeCloseTo(0.5)
    expect(voiceLevelFromRms(0.2)).toBe(1)
    expect(voiceLevelFromRms(3)).toBe(1)
  })

  it('keeps the bar count, adds at the end and drops the oldest bar', () => {
    expect(pushVoiceBar([], 0.5, 3)).toEqual([0, 0, 0.5])
    expect(pushVoiceBar([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4])
    expect(pushVoiceBar([0.1, 0.2, 0.3], 0.4, 2)).toEqual([0.3, 0.4])
    expect(pushVoiceBar([0.1], 0.4, 0)).toEqual([])
  })

  it('updates every bar in place with reduced motion and scrolls without it', () => {
    expect(nextVoiceBars([0.1, 0.2], 0.4, 2, true)).toEqual([0.4, 0.4])
    expect(nextVoiceBars([0.1, 0.2], 0.4, 2, false)).toEqual([0.2, 0.4])
  })

  it('fits 3 wide bars with a 3 gap and scales them from 4 to 24 high', () => {
    expect([0, 2, 3, 8, 9, 120].map(voiceBarCount)).toEqual([0, 0, 1, 1, 2, 20])
    expect(voiceBarScale(0) * 24).toBe(4)
    expect(voiceBarScale(1) * 24).toBe(24)
  })

  it('delivers each published level until the subscriber leaves', () => {
    const levels: number[] = []
    const unsubscribe = subscribeComposerVoiceLevel((level) => levels.push(level))
    publishComposerVoiceLevel(0.3)
    unsubscribe()
    publishComposerVoiceLevel(0.9)
    expect(levels).toEqual([0.3])
  })
})
