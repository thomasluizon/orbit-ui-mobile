import { describe, expect, it } from 'vitest'
import { getGoalDeadlineFact } from '../utils/goal-detail-line'
import { goalProgressSweepStart, parseGoalSeenProgress, recordGoalSeenProgress } from '../utils/goal-seen-progress'
import { createUseRingSweep } from '../hooks/ring-sweep-core'
import { createHookStateHarness } from '../test-support/hook-state'

describe('goal deadline fact', () => {
  const active = (deadline: string | null) => ({ deadline, status: 'Active' })

  it('counts the calendar days left until the deadline', () => {
    expect(getGoalDeadlineFact(active('2026-11-20'), '2026-11-13')).toEqual({ kind: 'daysLeft', days: 7 })
    expect(getGoalDeadlineFact(active('2026-11-14'), '2026-11-13')).toEqual({ kind: 'daysLeft', days: 1 })
  })

  it('counts across a month end and a year end', () => {
    expect(getGoalDeadlineFact(active('2026-12-01'), '2026-11-30')).toEqual({ kind: 'daysLeft', days: 1 })
    expect(getGoalDeadlineFact(active('2027-01-01'), '2026-12-31')).toEqual({ kind: 'daysLeft', days: 1 })
  })

  it('states the deadline of today and a passed deadline with its date', () => {
    expect(getGoalDeadlineFact(active('2026-11-13'), '2026-11-13')).toEqual({ kind: 'dueToday' })
    expect(getGoalDeadlineFact(active('2026-10-03T00:00:00'), '2026-11-13')).toEqual({ kind: 'passed', date: '2026-10-03' })
  })

  it('is absent with no deadline and for a goal that is no longer active', () => {
    expect(getGoalDeadlineFact(active(null), '2026-11-13')).toBeNull()
    expect(getGoalDeadlineFact({ deadline: '2026-11-20', status: 'Completed' }, '2026-11-13')).toBeNull()
    expect(getGoalDeadlineFact({ deadline: '2026-11-20', status: 'Abandoned' }, '2026-11-13')).toBeNull()
  })
})

describe('goal seen progress', () => {
  it('reads a stored map and drops a damaged value', () => {
    expect(parseGoalSeenProgress('{"a":25,"b":"x","c":null}')).toEqual({ a: 25 })
    expect(parseGoalSeenProgress('not json')).toEqual({})
    expect(parseGoalSeenProgress('[1,2]')).toEqual({})
    expect(parseGoalSeenProgress(null)).toEqual({})
  })

  it('sweeps only a goal whose value changed since the last visit', () => {
    const seen = { a: 25, b: 50 }
    expect(goalProgressSweepStart(seen, 'a', 40)).toBe(25)
    expect(goalProgressSweepStart(seen, 'b', 50)).toBeNull()
    expect(goalProgressSweepStart(seen, 'new', 10)).toBeNull()
    expect(goalProgressSweepStart(null, 'a', 40)).toBeNull()
  })

  it('records the value each goal shows now', () => {
    expect(recordGoalSeenProgress([{ id: 'a', progressPercentage: 40 }, { id: 'b', progressPercentage: 0 }])).toEqual({ a: 40, b: 0 })
  })
})

describe('ring sweep', () => {
  function setup(from: number | null) {
    const harness = createHookStateHarness()
    const frames: (() => void)[] = []
    const cleanups: (() => void)[] = []
    const useRingSweep = createUseRingSweep({
      useState: harness.useState,
      useEffect: (effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) },
      requestFrame: (callback) => frames.push(callback),
      cancelFrame: () => {},
    })
    return { render: (value: number) => harness.render(() => useRingSweep(value, from)), frames }
  }

  it('draws the old value, then the new value two frames later', () => {
    const { render, frames } = setup(25)
    expect(render(40)).toBe(25)
    frames.shift()?.()
    expect(frames).toHaveLength(1)
    frames.shift()?.()
    expect(render(40)).toBe(40)
  })

  it('draws the current value at once with nothing to sweep', () => {
    const { render, frames } = setup(null)
    expect(render(40)).toBe(40)
    expect(frames).toHaveLength(0)
  })
})
