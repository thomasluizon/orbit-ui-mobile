import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeComposerRecordingTime } from '../hooks/composer-recording-core'

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
