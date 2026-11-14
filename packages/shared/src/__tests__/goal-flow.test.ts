import { describe, expect, it } from 'vitest'
import {
  advanceGoalFlow,
  getGoalFlowStepError,
  goalFlowPosition,
  goalFlowSteps,
  openGoalFlowStep,
  retreatGoalFlow,
  startGoalFlow,
} from '../utils/goal-flow'

describe('goal flow', () => {
  it('asks every question for a new goal and skips the habits for a goal that starts from a habit', () => {
    expect(goalFlowSteps({ mode: 'create', fromHabit: false })).toEqual(['what', 'track', 'amount', 'deadline', 'habits', 'summary'])
    expect(goalFlowSteps({ mode: 'create', fromHabit: true })).toEqual(['what', 'track', 'amount', 'deadline', 'summary'])
  })

  it('opens edit on the summary', () => {
    expect(startGoalFlow('edit')).toEqual({ step: 'summary', trail: [], direction: 1 })
    expect(goalFlowSteps({ mode: 'edit', fromHabit: false })).toEqual(['summary'])
  })

  it('advances in order, goes back with every answer kept, and stops on the summary', () => {
    const steps = goalFlowSteps({ mode: 'create', fromHabit: false })
    let navigation = startGoalFlow('create')
    navigation = advanceGoalFlow(navigation, steps)
    expect(navigation).toEqual({ step: 'track', trail: [], direction: 1 })
    expect(retreatGoalFlow(navigation, steps)).toEqual({ step: 'what', trail: [], direction: -1 })
    expect(retreatGoalFlow(startGoalFlow('create'), steps)).toBeNull()
    const summary = { step: 'summary' as const, trail: [], direction: 1 as const }
    expect(advanceGoalFlow(summary, steps)).toEqual(summary)
  })

  it('returns to the summary after a step the summary opened', () => {
    const steps = goalFlowSteps({ mode: 'edit', fromHabit: false })
    const opened = openGoalFlowStep(startGoalFlow('edit'), 'deadline')
    expect(opened).toEqual({ step: 'deadline', trail: ['summary'], direction: 1 })
    expect(goalFlowPosition(opened, steps)).toEqual({ position: 1, total: 1 })
    expect(advanceGoalFlow(opened, steps)).toEqual({ step: 'summary', trail: [], direction: 1 })
    expect(retreatGoalFlow(opened, steps)).toEqual({ step: 'summary', trail: [], direction: -1 })
  })

  it('counts only the steps that remain', () => {
    const steps = goalFlowSteps({ mode: 'create', fromHabit: true })
    expect(goalFlowPosition({ step: 'amount', trail: [], direction: 1 }, steps)).toEqual({ position: 3, total: 5 })
  })

  it('gives the hint of the current form for an empty or invalid step', () => {
    const empty = { description: ' ', targetValue: '', unit: '' }
    expect(getGoalFlowStepError('what', empty)).toEqual({ field: 'description', key: 'goals.form.titleRequired' })
    expect(getGoalFlowStepError('what', { ...empty, description: 'x'.repeat(201) })).toEqual({ field: 'description', key: 'goals.form.titleTooLong' })
    expect(getGoalFlowStepError('amount', { description: 'Read', targetValue: '0', unit: 'books' })).toEqual({ field: 'targetValue', key: 'goals.form.targetValueRequired' })
    expect(getGoalFlowStepError('amount', { description: 'Read', targetValue: '12', unit: '' })).toEqual({ field: 'unit', key: 'goals.form.unitRequired' })
    expect(getGoalFlowStepError('amount', { description: 'Read', targetValue: '12', unit: 'books' })).toBeNull()
    expect(getGoalFlowStepError('deadline', empty)).toBeNull()
  })

  it('lets an edit keep an empty title, as the edit modal builds one from the target and the unit', () => {
    const empty = { description: '', targetValue: '12', unit: 'books' }
    expect(getGoalFlowStepError('what', empty, 'edit')).toBeNull()
    expect(getGoalFlowStepError('what', { ...empty, description: 'x'.repeat(201) }, 'edit')).toEqual({ field: 'description', key: 'goals.form.titleTooLong' })
  })
})
