import { createElement, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import { createUseRetainedGoal } from '../hooks'

const useRetainedGoal = createUseRetainedGoal(useState)

interface ProbeGoal { id: string; title: string }

function mountRetainedGoal(goal: ProbeGoal | null, goalId: string) {
  let retained: ProbeGoal | null = null
  function RetainedGoalProbe(props: { goal: ProbeGoal | null; goalId: string }) {
    retained = useRetainedGoal(props.goal, props.goalId)
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(RetainedGoalProbe, { goal, goalId })) })
  return {
    get current() { return retained },
    update: (nextGoal: ProbeGoal | null, nextGoalId: string) => {
      void act(() => tree.update(createElement(RetainedGoalProbe, { goal: nextGoal, goalId: nextGoalId })))
    },
  }
}

describe('shared retained goal', () => {
  const read = { id: 'goal-read', title: 'Read 12 books' }

  it('keeps the last goal when a refresh drops it', () => {
    const probe = mountRetainedGoal(read, read.id)
    probe.update(null, read.id)
    expect(probe.current).toBe(read)
  })

  it('follows a newer copy of the same goal', () => {
    const probe = mountRetainedGoal(read, read.id)
    const renamed = { ...read, title: 'Read 20 books' }
    probe.update(renamed, read.id)
    expect(probe.current).toBe(renamed)
  })

  it('never answers for a different goal', () => {
    const probe = mountRetainedGoal(read, read.id)
    probe.update(null, 'goal-run')
    expect(probe.current).toBeNull()
  })

  it('returns nothing before the goal first resolves', () => {
    expect(mountRetainedGoal(null, read.id).current).toBeNull()
  })
})
