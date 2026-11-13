import { describe, expect, it } from 'vitest'
import {
  advanceHabitFlow,
  habitFlowPosition,
  openHabitFlowStep,
  retreatHabitFlow,
  settleHabitFlow,
  startHabitFlow,
} from '../utils/habit-flow-navigation'
import type { HabitFlowStepId } from '../utils/habit-flow'

const steps: HabitFlowStepId[] = ['what', 'when', 'time', 'summary']

describe('habit flow navigation', () => {
  it('starts on the phrase for create and on the summary for edit', () => {
    expect(startHabitFlow('create').step).toBe('what')
    expect(startHabitFlow('edit').step).toBe('summary')
  })

  it('advances one step at a time and stays on the summary', () => {
    let navigation = startHabitFlow('create')
    navigation = advanceHabitFlow(navigation, steps)
    expect(navigation).toMatchObject({ step: 'when', direction: 1 })
    navigation = advanceHabitFlow(advanceHabitFlow(navigation, steps), steps)
    expect(navigation.step).toBe('summary')
    expect(advanceHabitFlow(navigation, steps).step).toBe('summary')
  })

  it('goes back one step, keeps no history on step 1 and reports it with null', () => {
    const onTime = { step: 'time', trail: [], direction: 1 } as const
    expect(retreatHabitFlow(onTime, steps)).toMatchObject({ step: 'when', direction: -1 })
    expect(retreatHabitFlow(startHabitFlow('create'), steps)).toBeNull()
  })

  it('returns an answer to the summary after a value was opened from it', () => {
    const summary = { step: 'summary', trail: [], direction: 1 } as const
    const opened = openHabitFlowStep(summary, 'time')
    expect(opened).toMatchObject({ step: 'time', trail: ['summary'] })
    expect(advanceHabitFlow(opened, steps).step).toBe('summary')
    expect(retreatHabitFlow(opened, steps)?.step).toBe('summary')
  })

  it('nests the optional list under the summary and returns one level at a time', () => {
    const summary = startHabitFlow('edit')
    const more = openHabitFlowStep(summary, 'more')
    const tags = openHabitFlowStep(more, 'optional:tags')
    expect(tags.trail).toEqual(['summary', 'more'])
    expect(advanceHabitFlow(tags, steps).step).toBe('more')
    expect(retreatHabitFlow(retreatHabitFlow(tags, steps)!, steps)?.step).toBe('summary')
  })

  it('has no back step from a detail step opened with an empty trail', () => {
    expect(retreatHabitFlow({ step: 'type', trail: [], direction: 1 }, steps)).toBeNull()
  })

  it('counts only the steps that remain and shows the summary position on a detail step', () => {
    expect(habitFlowPosition({ step: 'when', trail: [], direction: 1 }, steps)).toEqual({ position: 2, total: 4 })
    expect(habitFlowPosition({ step: 'type', trail: ['summary'], direction: 1 }, steps)).toEqual({ position: 4, total: 4 })
  })

  it('moves the person to the summary when the step they stand on no longer remains', () => {
    const remaining: HabitFlowStepId[] = ['what', 'summary']
    expect(settleHabitFlow({ step: 'when', trail: [], direction: 1 }, remaining).step).toBe('summary')
    expect(settleHabitFlow({ step: 'what', trail: [], direction: 1 }, remaining).step).toBe('what')
    expect(settleHabitFlow({ step: 'type', trail: ['summary'], direction: 1 }, remaining).step).toBe('type')
  })
})
