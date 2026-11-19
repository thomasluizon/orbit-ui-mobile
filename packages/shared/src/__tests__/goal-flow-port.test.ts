import { describe, expect, it, vi } from 'vitest'
import { GOAL_DEADLINE_CHOICES } from '../utils/goal-deadline-options'
import { createGoalEditPort, goalFlowStepOfField, goalResultSentenceKey, goalStepHintFor } from '../utils/goal-flow'

describe('goal flow field step', () => {
  it('opens the what step for the title and the amount step for the target and the unit', () => {
    expect(goalFlowStepOfField('description')).toBe('what')
    expect(goalFlowStepOfField('targetValue')).toBe('amount')
    expect(goalFlowStepOfField('unit')).toBe('amount')
  })
})

describe('goal edit port', () => {
  const draft = { description: 'Run 5 km', targetValue: '5', unit: 'km', deadline: '' }

  it('shows the draft values and the type of the stored goal, with no type change', () => {
    const streak = createGoalEditPort({ title: 'Run', targetValue: 5, unit: 'km', deadline: null, type: 'Streak' }, draft, vi.fn())
    expect(streak).toMatchObject({ goalType: 'Streak', ...draft })
    expect(streak).not.toHaveProperty('chooseType')
    expect(createGoalEditPort({ title: 'Run', targetValue: 5, unit: 'km', deadline: null }, draft, vi.fn()).goalType).toBe('Standard')
  })

  it('writes each answer as one change of its own field', () => {
    const update = vi.fn()
    const port = createGoalEditPort({ title: 'Run', targetValue: 5, unit: 'km', deadline: null }, draft, update)
    port.setDescription('Run 10 km')
    port.setTargetValue('10')
    port.setUnit('miles')
    port.setDeadline('2026-12-31')
    expect(update.mock.calls).toEqual([[{ description: 'Run 10 km' }], [{ targetValue: '10' }], [{ unit: 'miles' }], [{ deadline: '2026-12-31' }]])
  })
})

describe('goal step hint', () => {
  const hint = { field: 'unit' as const, message: 'Name the unit', request: 3 }

  it('gives the error and the focus request only to the field the hint names', () => {
    expect(goalStepHintFor(hint, 'unit')).toEqual({ error: 'Name the unit', focusRequest: 3 })
    expect(goalStepHintFor(hint, 'targetValue')).toEqual({})
    expect(goalStepHintFor(null, 'unit')).toEqual({})
  })
})

describe('goal result sentence', () => {
  it('states the deadline when the goal has one, and the no deadline sentence when it has none', () => {
    expect(goalResultSentenceKey('created', '2026-12-31')).toBe('result.goal.created')
    expect(goalResultSentenceKey('created', '')).toBe('result.goal.createdNoDeadline')
    expect(goalResultSentenceKey('updated', '2026-12-31')).toBe('result.goal.updated')
    expect(goalResultSentenceKey('updated', '')).toBe('result.goal.updatedNoDeadline')
  })
})

describe('goal deadline choices', () => {
  it('offers no deadline first, then the month end and the year end', () => {
    expect(GOAL_DEADLINE_CHOICES.map(({ choice }) => choice)).toEqual(['none', 'monthEnd', 'yearEnd'])
  })
})
