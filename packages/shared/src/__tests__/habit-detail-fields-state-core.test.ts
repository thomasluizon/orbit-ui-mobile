import { describe, expect, it, vi } from 'vitest'
import { createUseHabitDetailFieldsState } from '../hooks/habit-detail-fields-state-core'
import { createHookStateHarness } from '../test-support/hook-state'
import { makeHabitDetailScopedParent } from '../test-support/habit-detail-fixtures'

describe('shared habit detail fields state', () => {
  it('selects a created goal idempotently without another write and synchronizes refreshed links', () => {
    const harness = createHookStateHarness()
    const useFields = createUseHabitDetailFieldsState(harness.useState)
    const habit = makeHabitDetailScopedParent()
    const patch = vi.fn().mockResolvedValue(true)
    const render = () => harness.render(() => useFields(habit, patch))
    expect(render().goalLinking).toMatchObject({ habitId: habit.id, selectedGoalIds: ['goal-1'], atGoalLimit: false })
    render().goalLinking.onGoalCreated('created-goal')
    render().goalLinking.onGoalCreated('created-goal')
    expect(render().goalIds).toEqual(['goal-1', 'created-goal'])
    expect(patch).not.toHaveBeenCalled()
    habit.linkedGoals = []
    render()
    expect(render().goalIds).toEqual([])
  })

  it('refreshes a saved description while retaining an unsaved edit', () => {
    const harness = createHookStateHarness()
    const useFields = createUseHabitDetailFieldsState(harness.useState)
    const habit = { ...makeHabitDetailScopedParent(), description: 'Saved' }
    const render = () => harness.render(() => useFields(habit, vi.fn().mockResolvedValue(true)))
    expect(render().description).toBe('Saved')
    habit.description = 'Refreshed'
    render()
    expect(render().description).toBe('Refreshed')
    render().setDescription('Draft')
    habit.description = 'New server value'
    render()
    expect(render().description).toBe('Draft')
  })

  it('restores failed goal changes while preserving a newer selection', async () => {
    const harness = createHookStateHarness()
    const useFields = createUseHabitDetailFieldsState(harness.useState)
    const habit = makeHabitDetailScopedParent()
    let finish!: (saved: boolean) => void
    const patch = vi.fn().mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve })).mockResolvedValue(true)
    const render = () => harness.render(() => useFields(habit, patch))
    render().goalLinking.onToggleGoal('goal-2')
    render().goalLinking.onGoalCreated('created-goal')
    finish(false)
    await Promise.resolve()
    expect(render().goalIds).toEqual(['goal-1', 'goal-2', 'created-goal'])
    expect(patch).toHaveBeenCalledExactlyOnceWith({ goalIds: ['goal-1', 'goal-2'] })
  })

  it('keeps pending reminder edits through a server refresh and restores the last confirmed selection', async () => {
    const harness = createHookStateHarness()
    const useFields = createUseHabitDetailFieldsState(harness.useState)
    const habit = { ...makeHabitDetailScopedParent(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    let finish!: (saved: boolean) => void
    const patch = vi.fn().mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve }))
    const render = () => harness.render(() => useFields(habit, patch))
    expect(render().updateReminders({ offsets: [30] })).toBeNull()
    habit.reminderTimes = [60]
    render()
    expect(render().reminderHabit.reminderTimes).toEqual([30])
    finish(false)
    await Promise.resolve()
    expect(render().reminderHabit.reminderTimes).toEqual([15])
  })
})
