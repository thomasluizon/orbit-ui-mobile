import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useHabitDetailFieldsState } from '@/hooks/use-habit-detail-fields-state'
import { makeHabitDetailScopedParent } from '@orbit/shared/test-support/habit-detail-fixtures'

type FieldsState = ReturnType<typeof useHabitDetailFieldsState>

async function renderFieldsState(onPatch: Parameters<typeof useHabitDetailFieldsState>[1], habit = makeHabitDetailScopedParent()) {
  let state: FieldsState | undefined
  let renderer: ReactTestRenderer | undefined

  function Harness() {
    state = useHabitDetailFieldsState(habit, onPatch)
    return null
  }

  await act(() => {
    renderer = create(React.createElement(Harness))
  })

  return {
    current: () => {
      if (!state) throw new Error('Expected habit detail fields state to initialize')
      return state
    },
    renderer: renderer as ReactTestRenderer,
  }
}

describe('habit detail fields state', () => {
  it('toggles the goal editor without patching the habit', async () => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const fields = await renderFieldsState(onPatch)
    await act(() => { fields.current().toggleField('goals') })
    expect(fields.current().openField).toBe('goals')
    await act(() => { fields.current().toggleField('goals') })
    expect(fields.current().openField).toBeNull()
    expect(onPatch).not.toHaveBeenCalled()
    await act(() => { fields.renderer.update(React.createElement(React.Fragment)) })
  })

  it('patches goals and valid reminder changes', async () => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const fields = await renderFieldsState(onPatch)

    await act(() => fields.current().toggleGoal('goal-1'))
    expect(fields.current().goalIds).toEqual([])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: [] })

    await act(() => fields.current().toggleGoal('goal-2'))
    expect(fields.current().goalIds).toEqual(['goal-2'])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: ['goal-2'] })

    onPatch.mockClear()
    await act(() => { fields.current().updateReminders({ offsets: [30] }) })
    expect(fields.current().reminderHabit.reminderTimes).toEqual([30])
    expect(onPatch).toHaveBeenCalledTimes(1)
    onPatch.mockClear()
    await act(() => {
      expect(fields.current().updateReminders({ enabled: true })).toBe('habits.form.reminderMinimumOne')
    })
    expect(onPatch).not.toHaveBeenCalled()

    await act(() => { fields.current().updateReminders({ scheduled: [{ when: 'same_day', time: '08:00' }] }) })
    expect(fields.current().reminderHabit).toMatchObject({
      reminderEnabled: true,
      reminderTimes: [30],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    })
    expect(onPatch).toHaveBeenLastCalledWith({
      reminderEnabled: true,
      reminderTimes: [30],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    })

    fields.renderer.update(React.createElement(React.Fragment))
  })
  it.each(['relative', 'scheduled'])('rejects an over-cap %s reminder change before patching', async (cap) => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const habit = { ...makeHabitDetailScopedParent(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    const fields = await renderFieldsState(onPatch, habit)
    await act(() => {
      const changes = cap === 'relative'
        ? { offsets: Array.from({ length: 16 }, (_, index) => index * 10) }
        : { scheduled: Array.from({ length: 6 }, (_, index) => ({ when: 'same_day' as const, time: `0${index}:00` })) }
      expect(fields.current().updateReminders(changes)).toBe(cap === 'relative' ? 'habits.form.relativeReminderMax' : 'habits.form.scheduledReminderMax')
    })
    expect(onPatch).not.toHaveBeenCalled()
    await act(() => { fields.renderer.update(React.createElement(React.Fragment)) })
  })

  it('keeps a newer reminder selection when an older patch fails', async () => {
    let finishFirst!: (saved: boolean) => void
    const onPatch = vi.fn().mockReturnValueOnce(new Promise<boolean>((resolve) => { finishFirst = resolve })).mockResolvedValue(true)
    const fields = await renderFieldsState(onPatch)
    await act(() => { fields.current().updateReminders({ offsets: [30] }) })
    await act(() => { fields.current().updateReminders({ offsets: [60] }) })
    expect(fields.current().reminderHabit.reminderTimes).toEqual([60])
    await act(async () => { finishFirst(false); await Promise.resolve() })
    expect(fields.current().reminderHabit.reminderTimes).toEqual([60])
    expect(onPatch).toHaveBeenCalledTimes(2)
    await act(() => { fields.renderer.update(React.createElement(React.Fragment)) })
  })

  it('restores the last persisted reminders when consecutive patches fail', async () => {
    let finishFirst!: (saved: boolean) => void
    let finishSecond!: (saved: boolean) => void
    const onPatch = vi.fn()
      .mockReturnValueOnce(new Promise<boolean>((resolve) => { finishFirst = resolve }))
      .mockReturnValueOnce(new Promise<boolean>((resolve) => { finishSecond = resolve }))
    const fields = await renderFieldsState(onPatch)
    await act(() => { fields.current().updateReminders({ offsets: [30] }) })
    await act(() => { fields.current().updateReminders({ offsets: [60] }) })
    await act(async () => { finishFirst(false); await Promise.resolve() })
    await act(async () => { finishSecond(false); await Promise.resolve() })
    expect(fields.current().reminderHabit.reminderTimes).toEqual([])
    await act(() => { fields.renderer.update(React.createElement(React.Fragment)) })
  })

})
