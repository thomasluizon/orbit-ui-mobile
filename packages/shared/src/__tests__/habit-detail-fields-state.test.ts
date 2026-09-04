import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useHabitDetailFieldsState } from '../hooks/habit-detail-fields-state'
import { makeHabitDetailScopedParent } from '../test-support/habit-detail-fixtures'

type FieldsState = ReturnType<typeof useHabitDetailFieldsState>

async function renderFieldsState(onPatch: Parameters<typeof useHabitDetailFieldsState>[1]) {
  let state: FieldsState | undefined
  let renderer: ReactTestRenderer | undefined

  function Harness() {
    state = useHabitDetailFieldsState(makeHabitDetailScopedParent(), onPatch)
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

  it('closes a saved editor and patches goal and valid reminder drafts', async () => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const fields = await renderFieldsState(onPatch)

    act(() => fields.current().toggleGoal('goal-1'))
    expect(fields.current().goalIds).toEqual([])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: [] })

    act(() => fields.current().toggleGoal('goal-2'))
    expect(fields.current().goalIds).toEqual(['goal-2'])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: ['goal-2'] })

    onPatch.mockClear()
    act(() => fields.current().updateReminders({ offsets: [30] }))
    expect(fields.current().reminderHabit.reminderTimes).toEqual([30])
    expect(onPatch).not.toHaveBeenCalled()

    act(() => fields.current().updateReminders({ enabled: true }))
    expect(fields.current().saveReminders()).toBe('habits.form.reminderMinimumOne')
    expect(onPatch).not.toHaveBeenCalled()

    act(() => fields.current().updateReminders({ scheduled: [{ when: 'same_day', time: '08:00' }] }))
    expect(fields.current().reminderHabit).toMatchObject({
      reminderEnabled: true,
      reminderTimes: [30],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    })
    expect(fields.current().saveReminders()).toBeNull()
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
})
