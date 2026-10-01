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

  await act(async () => {
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
  it('toggles one editor and keeps it open when a save fails', async () => {
    const onPatch = vi.fn().mockResolvedValue(false)
    const fields = await renderFieldsState(onPatch)

    act(() => fields.current().toggleField('schedule'))
    expect(fields.current().openField).toBe('schedule')
    act(() => fields.current().toggleField('schedule'))
    expect(fields.current().openField).toBeNull()
    act(() => fields.current().toggleField('time'))
    act(() => fields.current().save({ dueTime: '08:00' }))
    await act(async () => Promise.resolve())

    expect(onPatch).toHaveBeenLastCalledWith({ dueTime: '08:00' })
    expect(fields.current().openField).toBe('time')
    fields.renderer.unmount()
  })

  it('closes a saved editor and patches goals and valid reminder changes', async () => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const fields = await renderFieldsState(onPatch)

    act(() => fields.current().toggleGoal('goal-1'))
    expect(fields.current().goalIds).toEqual([])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: [] })

    act(() => fields.current().toggleGoal('goal-2'))
    expect(fields.current().goalIds).toEqual(['goal-2'])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: ['goal-2'] })

    onPatch.mockClear()
    act(() => { fields.current().updateReminders({ offsets: [30] }) })
    expect(fields.current().reminderHabit.reminderTimes).toEqual([30])
    expect(onPatch).toHaveBeenCalledTimes(1)
    onPatch.mockClear()
    act(() => {
      expect(fields.current().updateReminders({ enabled: true })).toBe('habits.form.reminderMinimumOne')
    })
    expect(onPatch).not.toHaveBeenCalled()

    act(() => { fields.current().updateReminders({ scheduled: [{ when: 'same_day', time: '08:00' }] }) })
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

    act(() => fields.current().toggleField('description'))
    act(() => fields.current().save({ description: 'Read deliberately' }))
    await act(async () => Promise.resolve())
    expect(fields.current().openField).toBeNull()
    fields.renderer.unmount()
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
    await act(() => { fields.renderer.unmount() })
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
    await act(() => { fields.renderer.unmount() })
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
    await act(() => { fields.renderer.unmount() })
  })

})
