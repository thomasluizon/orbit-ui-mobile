import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import * as Sentry from '@sentry/nextjs'
import { TodayLaunchContent } from '@/components/today/today-launch-content'
import { startTodayLaunch } from '@/lib/today-launch'

const span = vi.hoisted(() => ({ setAttribute: vi.fn(), end: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ startInactiveSpan: vi.fn(() => span) }))

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('web Hoje first content', () => {
  it.each([[true, false], [false, false], [false, true]])('ends after the content frame with cache=%s empty=%s', (fromCache, empty) => {
    let paint!: FrameRequestCallback
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { paint = callback; return 1 }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    startTodayLaunch()
    expect(Sentry.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ startTime: performance.timeOrigin / 1000, attributes: { 'app.start.source': 'navigation' } }))
    render(<TodayLaunchContent enabled fromCache={fromCache} empty={empty}>{empty ? null : <div>Habit</div>}</TodayLaunchContent>)
    expect(span.end).not.toHaveBeenCalled()
    act(() => paint(0))
    expect(span.setAttribute.mock.calls).toEqual([['today.from_cache', fromCache], ['today.empty', empty]])
    expect(span.end).toHaveBeenCalledOnce()
  })

  it('cancels an unmounted frame and ignores another habit view', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    startTodayLaunch()
    const tree = render(<TodayLaunchContent enabled fromCache empty={false}><div>Habit</div></TodayLaunchContent>)
    tree.rerender(<TodayLaunchContent enabled={false} fromCache empty={false}><div>Habit</div></TodayLaunchContent>)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7)
    expect(span.end).not.toHaveBeenCalled()
  })
})
