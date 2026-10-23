import { describe, expect, it, vi } from 'vitest'
import { createUseGoalCreation, type GoalCreationOptions } from '../hooks/goal-creation-core'
import type { CreateGoalRequest } from '../types/goal'
import { createHookStateHarness } from '../test-support/hook-state'

function setup(initialHabitIds: string[] = []) {
  const harness = createHookStateHarness()
  let generation = 0
  const callbacks: (() => void)[] = []
  const create = vi.fn<(request: CreateGoalRequest) => Promise<{ id: string }>>().mockResolvedValue({ id: 'created-goal' })
  const backend = { fieldErrors: {}, clearBackendErrors: vi.fn(), reportBackendErrors: vi.fn<(error: unknown) => { field: 'description' | 'targetValue' | 'unit' | undefined; handled: boolean }>().mockReturnValue({ field: undefined, handled: false }) }
  const showError = vi.fn()
  const options: GoalCreationOptions = {
    open: true, initialHabitIds, translate: (key) => key, showError,
    onClose: vi.fn(), onCreated: vi.fn(), closeSheet: (callback) => { callbacks.push(callback) },
  }
  const useCreation = createUseGoalCreation({
    useState: harness.useState, useRef: () => ({ current: null }), useEffect: (effect) => effect(),
    useDismissGuard: ({ isDirty, onDismiss }) => ({ canDismiss: !isDirty, showDiscardDialog: false, requestDismiss: onDismiss, cancelDismiss: vi.fn(), confirmDismiss: onDismiss }),
    getAccountGeneration: () => generation,
    useCreateGoal: () => ({ isPending: false, mutateAsync: create }), useBackendFieldErrors: () => backend,
  })
  const render = () => harness.render(() => useCreation(options))
  const fill = () => {
    const form = render()
    form.setDescription('  Read every day  ')
    form.setTargetValue('12')
    form.setUnit(' books ')
  }
  return { render, fill, create, backend, options, showError, finishDismiss: () => callbacks.shift()?.(), changeAccount: () => { generation++ } }
}

describe('shared goal creation', () => {
  it.each([{ habitIds: [] }, { habitIds: ['habit-reading'] }])('creates once with the selected habits %j after validation and closes after dismissal', async ({ habitIds }) => {
    const context = setup(habitIds)
    expect(context.render().isDirty).toBe(false)
    context.fill()
    context.render().setDeadline('2099-12-01')
    await context.render().onSubmit()
    expect(context.create).toHaveBeenCalledExactlyOnceWith({ title: 'Read every day', targetValue: 12, unit: 'books', type: 'Standard', deadline: '2099-12-01', habitIds })
    expect(context.options.onCreated).not.toHaveBeenCalled()
    expect(context.options.onClose).not.toHaveBeenCalled()
    context.finishDismiss()
    expect(context.options.onCreated).toHaveBeenCalledExactlyOnceWith('created-goal', habitIds)
    expect(context.options.onClose).toHaveBeenCalledOnce()
    expect(context.render()).toMatchObject({ isDirty: false, description: '', habitIds })
  })

  it('retains habit selection while goal type changes and allows removing every habit', () => {
    const context = setup(['habit-reading'])
    context.render().handleTypeChange('Streak')
    expect(context.render()).toMatchObject({ isStreak: true, unit: 'goals.form.streakUnit', habitIds: ['habit-reading'] })
    context.render().handleTypeChange('Standard')
    context.render().setHabitIds([])
    expect(context.render()).toMatchObject({ isStreak: false, unit: '', habitIds: [], isDirty: true })
  })

  it.each([
    { field: 'description', message: 'goals.form.titleRequired' },
    { field: 'targetValue', message: 'goals.form.targetValueRequired' },
    { field: 'unit', message: 'goals.form.unitRequired' },
  ] as const)('focuses $field without writing when it is missing', async ({ field, message }) => {
    const context = setup()
    context.fill()
    if (field === 'description') context.render().setDescription('')
    if (field === 'targetValue') context.render().setTargetValue('')
    if (field === 'unit') context.render().setUnit('')
    await context.render().onSubmit()
    expect(context.create).not.toHaveBeenCalled()
    expect(context.showError).toHaveBeenCalledWith(message)
    expect(context.render().focusRequest).toEqual({ field })
    expect(context.render().fieldErrors).toEqual({ [field]: message })
  })

  it('preserves the draft on failure and retries with the same habits', async () => {
    const context = setup(['habit-reading'])
    context.fill()
    context.create.mockRejectedValueOnce(new Error('Save failed'))
    await context.render().onSubmit()
    expect(context.render()).toMatchObject({ formError: 'goals.form.createError', description: '  Read every day  ', habitIds: ['habit-reading'] })
    expect(context.options.onClose).not.toHaveBeenCalled()
    await context.render().onSubmit()
    expect(context.create).toHaveBeenCalledTimes(2)
    context.finishDismiss()
    expect(context.options.onClose).toHaveBeenCalledOnce()
  })

  it('routes mapped backend errors to the field without a second form error', async () => {
    const context = setup()
    context.fill()
    const failure = new Error('Invalid unit')
    context.create.mockRejectedValue(failure)
    context.backend.reportBackendErrors.mockReturnValue({ field: 'unit', handled: true })
    await context.render().onSubmit()
    expect(context.backend.reportBackendErrors).toHaveBeenCalledWith(failure)
    expect(context.render()).toMatchObject({ focusRequest: { field: 'unit' }, formError: '' })
  })

  it.each(['success', 'failure', 'dismissal'] as const)('ignores an old account during %s', async (phase) => {
    const context = setup()
    context.fill()
    let resolve!: (result: { id: string }) => void
    let reject!: (failure: Error) => void
    context.create.mockReturnValue(new Promise((fulfill, fail) => { resolve = fulfill; reject = fail }))
    const pending = context.render().onSubmit()
    if (phase !== 'dismissal') context.changeAccount()
    if (phase === 'failure') reject(new Error('Save failed'))
    else resolve({ id: 'created-goal' })
    await pending
    if (phase === 'dismissal') context.changeAccount()
    context.finishDismiss()
    expect(context.options.onClose).not.toHaveBeenCalled()
    expect(context.options.onCreated).not.toHaveBeenCalled()
    expect(context.backend.reportBackendErrors).not.toHaveBeenCalled()
  })

  it('resets only after a current-account dismissal', () => {
    const context = setup(['habit-reading'])
    context.fill()
    context.render().dismiss()
    expect(context.render().isDirty).toBe(true)
    context.finishDismiss()
    expect(context.render()).toMatchObject({ description: '', isDirty: false, habitIds: ['habit-reading'] })
    expect(context.options.onClose).toHaveBeenCalledOnce()
  })
})
