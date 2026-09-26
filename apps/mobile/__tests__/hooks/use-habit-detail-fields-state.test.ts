import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useHabitDetailFieldsState } from '@/hooks/use-habit-detail-fields-state'
import { makeHabitDetailScopedParent } from '@orbit/shared/test-support/habit-detail-fixtures'

type FieldsState = ReturnType<typeof useHabitDetailFieldsState>

async function renderFieldsState(onPatch: Parameters<typeof useHabitDetailFieldsState>[1]) {
  let state: FieldsState | undefined
  let renderer: ReactTestRenderer | undefined

  function Harness() {
    state = useHabitDetailFieldsState(makeHabitDetailScopedParent(), onPatch)
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
  it('toggles one editor and keeps it open when a save fails', async () => {
    const onPatch = vi.fn().mockResolvedValue(false)
    const fields = await renderFieldsState(onPatch)

    await act(() => fields.current().toggleField('schedule'))
    expect(fields.current().openField).toBe('schedule')
    await act(() => fields.current().toggleField('schedule'))
    expect(fields.current().openField).toBeNull()
    await act(() => fields.current().toggleField('time'))
    await act(() => fields.current().save({ dueTime: '08:00' }))
    await act(async () => Promise.resolve())

    expect(onPatch).toHaveBeenLastCalledWith({ dueTime: '08:00' })
    expect(fields.current().openField).toBe('time')
    fields.renderer.update(React.createElement(React.Fragment))
  })

  it('closes a saved editor and patches goal and valid reminder drafts', async () => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const fields = await renderFieldsState(onPatch)

    await act(() => fields.current().toggleGoal('goal-1'))
    expect(fields.current().goalIds).toEqual([])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: [] })

    await act(() => fields.current().toggleGoal('goal-2'))
    expect(fields.current().goalIds).toEqual(['goal-2'])
    expect(onPatch).toHaveBeenLastCalledWith({ goalIds: ['goal-2'] })

    onPatch.mockClear()
    await act(() => fields.current().updateReminders({ offsets: [30] }))
    expect(fields.current().reminderHabit.reminderTimes).toEqual([30])
    expect(onPatch).not.toHaveBeenCalled()

    await act(() => fields.current().updateReminders({ enabled: true }))
    expect(fields.current().saveReminders()).toBe('habits.form.reminderMinimumOne')
    expect(onPatch).not.toHaveBeenCalled()

    await act(() => fields.current().updateReminders({ scheduled: [{ when: 'same_day', time: '08:00' }] }))
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

    await act(() => fields.current().toggleField('description'))
    await act(() => fields.current().save({ description: 'Read deliberately' }))
    await act(async () => Promise.resolve())
    expect(fields.current().openField).toBeNull()
    fields.renderer.update(React.createElement(React.Fragment))
  })
})
