import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CelebrationPresentation } from '../stores/celebration-presentation'

function setup(daily = true, reduced = false) {
  let generation = 0
  let activeId = 'earned'
  const complete = vi.fn()
  const presentation = new CelebrationPresentation({ daily, reduced, complete,
    isCurrent: () => generation === 0 && activeId === 'earned' })
  presentation.start(false)
  return { presentation, complete, replace: (id: string) => { activeId = id }, switchAccount: () => { generation++ } }
}

describe('earned notice presentation deadlines', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
  afterEach(() => vi.useRealTimers())

  it('uses one idempotent completion for the callback and missing-callback deadline', () => {
    const { presentation, complete } = setup()
    presentation.dismiss()
    const { revision } = presentation.getSnapshot()
    presentation.finishExit(revision)
    expect(complete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(220)
    presentation.finishExit(revision)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('retains the daily reservation until 2500 while beginning exit at 2280', () => {
    const { presentation, complete } = setup()
    vi.advanceTimersByTime(2279)
    expect(presentation.getSnapshot().phase).toBe('hold')
    vi.advanceTimersByTime(1)
    expect(presentation.getSnapshot().phase).toBe('automatic-exit')
    vi.advanceTimersByTime(219)
    expect(complete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('cancels automatic exit and its stale callback until every pause ends', () => {
    const { presentation, complete } = setup()
    vi.advanceTimersByTime(2350)
    const { revision } = presentation.getSnapshot()
    presentation.pause('hover', true)
    presentation.pause('focus', true)
    expect(presentation.getSnapshot().phase).toBe('hold')
    vi.advanceTimersByTime(5000)
    presentation.finishExit(revision)
    expect(complete).not.toHaveBeenCalled()
    presentation.pause('hover', false)
    vi.advanceTimersByTime(5000)
    expect(complete).not.toHaveBeenCalled()
    presentation.pause('focus', false)
    vi.advanceTimersByTime(2499)
    expect(complete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('commits manual dismissal through repeated close and late hover', () => {
    const { presentation, complete } = setup()
    vi.advanceTimersByTime(100)
    presentation.dismiss()
    vi.advanceTimersByTime(100)
    presentation.dismiss()
    presentation.pause('hover', true)
    presentation.pause('focus', true)
    vi.advanceTimersByTime(120)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('keeps the deadline when a held preference changes in either direction', () => {
    const { presentation, complete } = setup()
    vi.advanceTimersByTime(1000)
    presentation.setReducedMotion(true)
    expect(presentation.getSnapshot().phase).toBe('hold')
    vi.advanceTimersByTime(1000)
    presentation.setReducedMotion(false)
    vi.advanceTimersByTime(500)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it.each(['manual', 'automatic'] as const)('finishes a pending %s exit immediately on reduced motion', (kind) => {
    const { presentation, complete } = setup()
    if (kind === 'manual') presentation.dismiss()
    else vi.advanceTimersByTime(2280)
    presentation.setReducedMotion(true)
    expect(complete).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('settles background motion and uses clock comparisons after suspended timers', () => {
    const { presentation, complete } = setup()
    vi.advanceTimersByTime(100)
    presentation.setHidden(true)
    expect(presentation.getSnapshot()).toMatchObject({ phase: 'hold', hidden: true })
    vi.setSystemTime(3000)
    presentation.setHidden(false)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('keeps remaining time after backgrounding during automatic exit', () => {
    const { presentation, complete } = setup()
    vi.advanceTimersByTime(2300)
    presentation.setHidden(true)
    vi.advanceTimersByTime(100)
    presentation.setHidden(false)
    expect(presentation.getSnapshot().phase).toBe('hold')
    vi.advanceTimersByTime(99)
    expect(presentation.getSnapshot().phase).toBe('hold')
    expect(complete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('keeps manual facts indefinitely after backgrounding', () => {
    const { presentation, complete } = setup(false)
    presentation.setHidden(true)
    vi.advanceTimersByTime(50000)
    presentation.setHidden(false)
    expect(presentation.getSnapshot().phase).toBe('hold')
    expect(complete).not.toHaveBeenCalled()
  })

  it('rejects exact-ID replacement and A-to-B-to-A callbacks', () => {
    const first = setup()
    first.presentation.dismiss()
    first.replace('later')
    vi.advanceTimersByTime(220)
    expect(first.complete).not.toHaveBeenCalled()
    const second = setup()
    second.presentation.dismiss()
    second.switchAccount()
    second.switchAccount()
    vi.advanceTimersByTime(220)
    expect(second.complete).not.toHaveBeenCalled()
  })

  it('cancels every callback on unmount and invalidation', () => {
    const { presentation, complete } = setup()
    presentation.dismiss()
    const { revision } = presentation.getSnapshot()
    presentation.stop()
    vi.advanceTimersByTime(10000)
    presentation.finishExit(revision)
    expect(complete).not.toHaveBeenCalled()
  })
})
