import { describe, expect, it, vi } from 'vitest'
import { useHabitGoalSelection, createUseGoalLinking, type GoalLinkingFieldProps } from '../hooks/goal-linking-core'
import { createGoalHabitPicker, createUseGoalHabitCreation, getGoalHabitProgressNote } from '../hooks/goal-habit-picker-core'
import { createHookStateHarness } from '../test-support/hook-state'
import { createMockGoal, createMockHabit } from './factories'

describe('shared goal linking', () => {
  it('marks edited relationships as touched and selects created goals once', () => {
    const harness = createHookStateHarness()
    const touched = { current: { goalIds: false } }
    const render = () => harness.render(() => {
      const [goalIds, setGoalIds] = harness.useState(['existing-goal'])
      return { goalIds, ...useHabitGoalSelection(setGoalIds, touched) }
    })
    render().selectCreatedGoal('created-goal')
    render().selectCreatedGoal('created-goal')
    expect(render().goalIds).toEqual(['existing-goal', 'created-goal'])
    expect(touched.current.goalIds).toBe(true)
    render().toggleGoal('existing-goal')
    expect(render().goalIds).toEqual(['created-goal'])
  })

  it('loads the same named habit form for prefetch and lazy rendering and shares its habit query', async () => {
    const harness = createHookStateHarness()
    const component = Symbol('habit-form')
    const habit = createMockHabit()
    const query = { data: { habitsById: new Map([[habit.id, habit]]) }, isLoading: false, isError: false, refetch: vi.fn() }
    const loadModule = vi.fn().mockResolvedValue({ CreateHabitModal: component })
    const picker = createGoalHabitPicker({ useState: harness.useState, getAccountGeneration: () => 0, useHabits: () => query, loadModule, lazy: (loader) => loader })
    const render = () => harness.render(() => picker.useGoalHabitCreation((callback) => callback()))
    expect(render()).toMatchObject({ habits: query, items: [habit] })
    await render().openHabitForm()
    expect(render().creatingHabit).toBe(true)
    expect(await picker.CreateHabitModal()).toEqual({ default: component })
    expect(loadModule).toHaveBeenCalledTimes(2)
  })

  it('filters active goals, seeds the habit and opens creation after the picker dismisses', () => {
    const harness = createHookStateHarness()
    const useLinking = createUseGoalLinking(harness.useState)
    const active = createMockGoal({ id: 'active' })
    const goals = [active, createMockGoal({ id: 'finished', status: 'Completed' })]
    const props = { habitId: 'habit-reading', selectedGoalIds: [active.id], atGoalLimit: false, onToggleGoal: vi.fn() }
    let dismissed: (() => void) | undefined
    const render = () => harness.render(() => useLinking(props, goals, (callback) => { dismissed = callback }))
    expect(render()).toMatchObject({ activeGoals: [active], selectedGoals: [active], initialHabitIds: ['habit-reading'] })
    render().setOpen(true)
    render().openCreateGoal()
    expect(render()).toMatchObject({ open: true, creating: false })
    dismissed?.()
    expect(render()).toMatchObject({ open: false, creating: true })
  })

  it.each([
    { habitId: undefined, selected: [], limited: false, callback: false, toggles: 1, created: 0 },
    { habitId: undefined, selected: [], limited: false, callback: true, toggles: 0, created: 1 },
    { habitId: 'habit-reading', selected: ['habit-reading'], limited: false, callback: true, toggles: 0, created: 1 },
    { habitId: 'habit-reading', selected: [], limited: false, callback: true, toggles: 0, created: 0 },
    { habitId: 'habit-reading', selected: ['habit-reading'], limited: false, callback: false, toggles: 0, created: 0 },
    { habitId: 'habit-reading', selected: ['habit-reading'], limited: true, callback: true, toggles: 0, created: 0 },
  ])('selects a created goal only when the current habit permits it: %j', ({ habitId, selected, limited, callback, toggles, created }) => {
    const harness = createHookStateHarness()
    const toggle = vi.fn()
    const onCreated = vi.fn()
    const props: GoalLinkingFieldProps = { habitId, selectedGoalIds: [], atGoalLimit: limited, onToggleGoal: toggle, onGoalCreated: callback ? onCreated : undefined }
    const hook = createUseGoalLinking(harness.useState)
    harness.render(() => hook(props, undefined, vi.fn())).handleCreated('new-goal', selected)
    expect(toggle).toHaveBeenCalledTimes(toggles)
    expect(onCreated).toHaveBeenCalledTimes(created)
    if (toggles) expect(toggle).toHaveBeenCalledWith('new-goal')
    if (created) expect(onCreated).toHaveBeenCalledWith('new-goal')
  })

  it.each(['Standard', 'Streak'] as const)('shows the %s explanation only for a selected habit to avoid', (type) => {
    const habit = createMockHabit({ isBadHabit: true })
    const habits = new Map([[habit.id, habit]])
    expect(getGoalHabitProgressNote([], habits, type)).toBeNull()
    expect(getGoalHabitProgressNote([habit.id], undefined, type)).toBeNull()
    expect(getGoalHabitProgressNote([habit.id], new Map([[habit.id, { ...habit, isBadHabit: false }]]), type)).toBeNull()
    expect(getGoalHabitProgressNote([habit.id], habits, type)).toBe(type === 'Streak' ? 'goals.form.avoidedDays' : 'goals.form.loggedSlips')
  })

  it('keeps the picker present during lazy loading, exposes failures and retries after dismissal', async () => {
    const harness = createHookStateHarness()
    const useCreation = createUseGoalHabitCreation(harness.useState, () => 0, () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }))
    let finish!: () => void
    const load = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error('Chunk failed')).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    let dismiss!: () => void
    const render = () => harness.render(() => useCreation(load, (callback) => { dismiss = callback }))
    await render().openHabitForm()
    expect(render()).toMatchObject({ habitFormState: 'error', creatingHabit: false })
    const pending = render().openHabitForm()
    expect(render()).toMatchObject({ habitFormState: 'loading', creatingHabit: false })
    finish()
    await pending
    expect(render()).toMatchObject({ habitFormState: 'idle', creatingHabit: false })
    dismiss()
    expect(render().creatingHabit).toBe(true)
    render().setCreatingHabit(false)
    expect(render().creatingHabit).toBe(false)
  })

  it.each(['loading', 'dismissal'] as const)('does not open an old account habit form after %s', async (phase) => {
    const harness = createHookStateHarness()
    let generation = 0
    let finish!: () => void
    let dismiss: (() => void) | undefined
    const load = () => new Promise<void>((resolve) => { finish = resolve })
    const useCreation = createUseGoalHabitCreation(harness.useState, () => generation, () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }))
    const render = () => harness.render(() => useCreation(load, (callback) => { dismiss = callback }))
    const pending = render().openHabitForm()
    if (phase === 'loading') generation++
    finish()
    await pending
    if (phase === 'dismissal') generation++
    dismiss?.()
    expect(render().creatingHabit).toBe(false)
  })
})
