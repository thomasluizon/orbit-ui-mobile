import { createElement, useMemo, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseGuidedGoalFlow, type GuidedGoalFlowNavigation } from '../hooks/guided-goal-flow-core'
import type { GoalFlowOptions } from '../utils/goal-flow'

const useGuidedGoalFlow = createUseGuidedGoalFlow({ useState, useMemo })

function mountFlow(options: GoalFlowOptions) {
  let flow!: GuidedGoalFlowNavigation
  function FlowProbe() {
    flow = useGuidedGoalFlow(options)
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(FlowProbe)) })
  return { get flow() { return flow }, unmount: () => { void act(() => tree.unmount()) } }
}

describe('shared guided goal flow navigation', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
  afterEach(() => vi.unstubAllGlobals())

  it('starts a create on the first question with no way back, and walks forward with its place', () => {
    const mounted = mountFlow({ mode: 'create', fromHabit: false })
    expect(mounted.flow.current.step).toBe(mounted.flow.steps[0])
    expect(mounted.flow.canGoBack).toBe(false)
    expect(mounted.flow.position.position).toBe(1)
    void act(() => mounted.flow.advance())
    expect(mounted.flow.current).toMatchObject({ step: mounted.flow.steps[1], direction: 1 })
    expect(mounted.flow.position.position).toBe(2)
    expect(mounted.flow.canGoBack).toBe(true)
    void act(() => mounted.flow.back())
    expect(mounted.flow.current).toMatchObject({ step: mounted.flow.steps[0], direction: -1 })
    mounted.unmount()
  })

  it('does nothing on back from the first question', () => {
    const mounted = mountFlow({ mode: 'create', fromHabit: false })
    const before = mounted.flow.current
    void act(() => mounted.flow.back())
    expect(mounted.flow.current).toBe(before)
    mounted.unmount()
  })

  it('opens an edit on the summary, opens a step from it, and comes back to the summary on back', () => {
    const mounted = mountFlow({ mode: 'edit', fromHabit: false })
    expect(mounted.flow.current.step).toBe('summary')
    void act(() => mounted.flow.open('amount'))
    expect(mounted.flow.current.step).toBe('amount')
    expect(mounted.flow.canGoBack).toBe(true)
    void act(() => mounted.flow.back())
    expect(mounted.flow.current.step).toBe('summary')
    mounted.unmount()
  })
})
