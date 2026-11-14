import { describe, expect, it } from 'vitest'
import { buildGoalUpdateRequest, createGoalEditDraft, getGoalEditError, isGoalEditDirty } from '../hooks/goal-edit-core'

const goal = { title: 'Run 100km', targetValue: 100, unit: 'km', deadline: '2026-12-31', type: 'Standard' }

describe('goal edit core', () => {
  it('starts clean from the stored values', () => {
    const draft = createGoalEditDraft(goal)
    expect(draft).toEqual({ description: 'Run 100km', targetValue: '100', unit: 'km', deadline: '2026-12-31' })
    expect(isGoalEditDirty(draft, goal)).toBe(false)
    expect(isGoalEditDirty(createGoalEditDraft({ ...goal, deadline: null }), { ...goal, deadline: null })).toBe(false)
  })

  it('turns dirty when one value changes', () => {
    expect(isGoalEditDirty({ ...createGoalEditDraft(goal), deadline: '' }, goal)).toBe(true)
    expect(isGoalEditDirty({ ...createGoalEditDraft(goal), targetValue: '120' }, goal)).toBe(true)
  })

  it('builds the update request the edit form sends', () => {
    expect(buildGoalUpdateRequest({ description: ' Run 120km ', targetValue: '120', unit: ' km ', deadline: '' }))
      .toEqual({ title: 'Run 120km', targetValue: 120, unit: 'km', deadline: null })
    expect(buildGoalUpdateRequest({ description: '', targetValue: '12', unit: 'books', deadline: '2026-12-31' }))
      .toEqual({ title: '12 books', targetValue: 12, unit: 'books', deadline: '2026-12-31' })
    expect(buildGoalUpdateRequest({ description: 'Run', targetValue: 'x', unit: 'km', deadline: '' })).toBeNull()
  })

  it('names the first invalid field', () => {
    expect(getGoalEditError({ description: 'Run', targetValue: '0', unit: 'km', deadline: '' })).toEqual({ field: 'targetValue', key: 'goals.form.targetValueRequired' })
    expect(getGoalEditError(createGoalEditDraft(goal))).toBeNull()
  })
})
