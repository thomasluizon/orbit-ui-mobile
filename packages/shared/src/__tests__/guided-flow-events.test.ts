import { describe, expect, it, vi } from 'vitest'
import {
  createGuidedFlowTracker,
  markGuidedFlowCompleted,
  resetGuidedFlowCompleted,
  takeGuidedFlowCompleted,
  type GuidedFlowEvent,
} from '../utils/guided-flow-events'

describe('guided flow tracker', () => {
  it('reports each step once with its flow id and the step count', () => {
    const sink = vi.fn<(event: GuidedFlowEvent) => void>()
    const tracker = createGuidedFlowTracker('habit_create', sink)
    tracker.viewed('what', 3)
    tracker.viewed('what', 3)
    tracker.viewed('summary', 3)
    expect(sink.mock.calls.map(([event]) => event)).toEqual([
      { name: 'guided_flow_step_viewed', properties: { flow: 'habit_create', step: 'what', step_count: 3 } },
      { name: 'guided_flow_step_viewed', properties: { flow: 'habit_create', step: 'summary', step_count: 3 } },
    ])
  })

  it('reports an abandon once, at the step the person left', () => {
    const sink = vi.fn<(event: GuidedFlowEvent) => void>()
    const tracker = createGuidedFlowTracker('goal_create', sink)
    tracker.viewed('what', 4)
    tracker.abandoned()
    tracker.abandoned()
    expect(sink).toHaveBeenLastCalledWith({ name: 'guided_flow_abandoned', properties: { flow: 'goal_create', step: 'what' } })
    expect(sink).toHaveBeenCalledTimes(2)
  })

  it('reports no abandon before the first step shows', () => {
    const sink = vi.fn()
    createGuidedFlowTracker('habit_edit', sink).abandoned()
    expect(sink).not.toHaveBeenCalled()
  })

  it('keeps a completed flow from reading as abandoned', () => {
    resetGuidedFlowCompleted('habit_create')
    expect(takeGuidedFlowCompleted('habit_create')).toBe(false)
    markGuidedFlowCompleted('habit_create')
    expect(takeGuidedFlowCompleted('habit_create')).toBe(true)
    expect(takeGuidedFlowCompleted('habit_create')).toBe(false)
  })
})
