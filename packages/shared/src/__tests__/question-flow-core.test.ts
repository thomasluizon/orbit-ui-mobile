import { createElement, useEffect, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuestionFlowHooks } from '../hooks/question-flow-core'
import { markGuidedFlowCompleted, takeGuidedFlowCompleted, type GuidedFlowEvent } from '../utils/guided-flow-events'

const events: GuidedFlowEvent[] = []
const { useFlowAnnouncement, useGuidedFlowTracking } = createQuestionFlowHooks({ useState, useEffect, useRef, capture: (event) => events.push(event) })

function mountAnnouncement(line: string | null, stepKey: string) {
  let announced = ''
  function AnnouncementProbe(props: { line: string | null; stepKey: string }) {
    announced = useFlowAnnouncement(props.line, props.stepKey)
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(AnnouncementProbe, { line, stepKey })) })
  return {
    get announced() { return announced },
    update: (nextLine: string | null, nextStep: string) => { void act(() => tree.update(createElement(AnnouncementProbe, { line: nextLine, stepKey: nextStep }))) },
    wait: (ms: number) => { void act(() => { vi.advanceTimersByTime(ms) }) },
    unmount: () => { void act(() => tree.unmount()) },
  }
}

function mountTracking(stepKey: string, stepCount: number) {
  function TrackingProbe(props: { stepKey: string; stepCount: number }) {
    useGuidedFlowTracking('goal_create', props.stepKey, props.stepCount)
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(TrackingProbe, { stepKey, stepCount })) })
  return {
    update: (nextStep: string, nextCount: number) => { void act(() => tree.update(createElement(TrackingProbe, { stepKey: nextStep, stepCount: nextCount }))) },
    unmount: () => { void act(() => tree.unmount()) },
  }
}

describe('shared question flow announcement', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('announces a line of the step only after a one second pause', () => {
    const flow = mountAnnouncement('Every Monday at 7', 'when')
    flow.wait(999)
    expect(flow.announced).toBe('')
    flow.wait(1)
    expect(flow.announced).toBe('Every Monday at 7')
    flow.unmount()
  })

  it('announces only the last line when the person types again inside the pause', () => {
    const flow = mountAnnouncement('Every Mon', 'when')
    flow.wait(600)
    flow.update('Every Monday', 'when')
    flow.wait(600)
    expect(flow.announced, 'the first pause did not end').toBe('')
    flow.wait(400)
    expect(flow.announced).toBe('Every Monday')
    flow.unmount()
  })

  it('clears the announcement on a step change and announces nothing for the line that comes with the new step', () => {
    const flow = mountAnnouncement('Every Monday', 'when')
    flow.wait(1000)
    flow.update('At 7 in the morning', 'time')
    expect(flow.announced).toBe('')
    flow.wait(5000)
    expect(flow.announced, 'the question of the step carries this line').toBe('')
    flow.update('At 8 in the morning', 'time')
    flow.wait(1000)
    expect(flow.announced).toBe('At 8 in the morning')
    flow.unmount()
  })

  it('announces nothing with no line, and leaves no timer when the flow closes inside the pause', () => {
    const empty = mountAnnouncement(null, 'what')
    empty.wait(2000)
    expect(empty.announced).toBe('')
    empty.unmount()
    const closed = mountAnnouncement('Every Monday', 'when')
    expect(vi.getTimerCount()).toBe(1)
    closed.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('shared question flow tracking', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    events.length = 0
  })
  afterEach(() => {
    takeGuidedFlowCompleted('goal_create')
    vi.unstubAllGlobals()
  })

  it('reports each step view one time, and a rerender of the same step reports nothing', () => {
    const flow = mountTracking('title', 3)
    flow.update('title', 3)
    flow.update('deadline', 3)
    expect(events).toEqual([
      { name: 'guided_flow_step_viewed', properties: { flow: 'goal_create', step: 'title', step_count: 3 } },
      { name: 'guided_flow_step_viewed', properties: { flow: 'goal_create', step: 'deadline', step_count: 3 } },
    ])
    flow.unmount()
  })

  it('reports the flow as left at its last step when it closes before the end', () => {
    const flow = mountTracking('title', 3)
    flow.update('deadline', 3)
    events.length = 0
    flow.unmount()
    expect(events).toEqual([{ name: 'guided_flow_abandoned', properties: { flow: 'goal_create', step: 'deadline' } }])
  })

  it('reports no abandon for a completed flow, and uses the completed fact one time', () => {
    const flow = mountTracking('title', 3)
    markGuidedFlowCompleted('goal_create')
    events.length = 0
    flow.unmount()
    expect(events).toEqual([])
    expect(takeGuidedFlowCompleted('goal_create'), 'the shell consumed the fact').toBe(false)
  })

  it('clears a stale completed fact when the flow starts again, so the next close reports the abandon', () => {
    markGuidedFlowCompleted('goal_create')
    const flow = mountTracking('title', 3)
    events.length = 0
    flow.unmount()
    expect(events).toEqual([{ name: 'guided_flow_abandoned', properties: { flow: 'goal_create', step: 'title' } }])
  })
})
