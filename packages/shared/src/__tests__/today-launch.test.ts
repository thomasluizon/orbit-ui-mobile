import { describe, expect, it, vi } from 'vitest'
import { sampleTodayLaunch, startTodayLaunchTiming, TODAY_LAUNCH_SPAN_NAME, isTodayLaunchCache } from '../utils/today-launch'

describe('Hoje launch timing', () => {
  it('identifies restored rows until a fetch replaces them, including a failed background refresh', () => {
    expect(isTodayLaunchCache({ available: false, updatedAt: 0 }, 1)).toBe(false)
    expect(isTodayLaunchCache({ available: true, updatedAt: 1 }, 1)).toBe(true)
    expect(isTodayLaunchCache({ available: true, updatedAt: 1 }, 2)).toBe(false)
  })

  it('samples the first-content transaction without enabling unrelated traces', () => {
    expect(sampleTodayLaunch({ name: TODAY_LAUNCH_SPAN_NAME })).toBe(1)
    expect(sampleTodayLaunch({ name: 'GET /api/habits' })).toBe(0)
    expect(sampleTodayLaunch({ name: 'app.start.cold' })).toBe(0)
  })

  it.each([[true, false], [false, false], [true, true], [false, true]])('ends once with cache=%s and empty=%s', (fromCache, empty) => {
    const span = { setAttribute: vi.fn(), end: vi.fn() }
    const startSpan = vi.fn(() => span)
    const finish = startTodayLaunchTiming(startSpan, 10, 'native')
    expect(startSpan).toHaveBeenCalledExactlyOnceWith({
      name: TODAY_LAUNCH_SPAN_NAME, op: 'ui.load', startTime: 10,
      parentSpan: null, forceTransaction: true, attributes: { 'app.start.source': 'native' },
    })
    expect(span.end).not.toHaveBeenCalled()
    finish(fromCache, empty)
    finish(!fromCache, !empty)
    expect(span.setAttribute.mock.calls).toEqual([['today.from_cache', fromCache], ['today.empty', empty]])
    expect(span.end).toHaveBeenCalledOnce()
  })
})
