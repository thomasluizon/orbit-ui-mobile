import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToastDuration, notifyToastNavigation, subscribeToastNavigation, ToastLifetime } from '../hooks/toast-lifecycle-core'

describe('toast lifetime', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('gives action feedback a five second floor and preserves longer durations', () => {
    expect(getToastDuration()).toBe(5000)
    expect(getToastDuration(1000)).toBe(5000)
    expect(getToastDuration(8000)).toBe(8000)
  })

  it('expires once at the original deadline across repeated starts', () => {
    const lifetime = new ToastLifetime(getToastDuration())
    const completed = vi.fn(() => lifetime.finish())
    lifetime.start(completed)
    vi.advanceTimersByTime(3000)
    lifetime.start(completed)
    vi.advanceTimersByTime(1999)
    expect(completed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(completed).toHaveBeenCalledOnce()
    lifetime.start(completed)
    vi.advanceTimersByTime(5000)
    expect(completed).toHaveBeenCalledOnce()
  })

  it('pauses indefinitely and resumes only the remaining lifetime', () => {
    const lifetime = new ToastLifetime(5000)
    const completed = vi.fn()
    lifetime.pause()
    lifetime.start(completed)
    vi.advanceTimersByTime(2000)
    lifetime.pause()
    lifetime.pause()
    vi.advanceTimersByTime(30000)
    expect(completed).not.toHaveBeenCalled()
    lifetime.start(completed)
    vi.advanceTimersByTime(2999)
    expect(completed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(completed).toHaveBeenCalledOnce()
  })

  it('cancels expiration on manual dismissal and rejects repeated completion', () => {
    const lifetime = new ToastLifetime(5000)
    const completed = vi.fn()
    lifetime.start(completed)
    vi.advanceTimersByTime(1000)
    expect(lifetime.finish()).toBe(true)
    expect(lifetime.finish()).toBe(false)
    lifetime.start(completed)
    vi.advanceTimersByTime(5000)
    expect(completed).not.toHaveBeenCalled()
  })

  it('notifies navigation listeners until they unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToastNavigation(listener)
    notifyToastNavigation()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    notifyToastNavigation()
    expect(listener).toHaveBeenCalledOnce()
  })
})
