import { describe, expect, it, vi } from 'vitest'
import { createUseHabitSuggestionView, habitSuggestionSchedule } from '../chat/habit-suggestion-view'
import type { HabitSuggestionActions } from '../chat/habit-suggestion-controller'
import { createHookStateHarness } from '../test-support/hook-state'
import { habitSuggestionDraftFixture as draft, untimedHabitSuggestionDraftFixture as untimedDraft, makeHabitSuggestionMessage, makeHabitSuggestionPreview } from '../test-support/habit-suggestion-fixtures'

function setup() {
  const harness = createHookStateHarness()
  const useView = createUseHabitSuggestionView({ useState: harness.useState, useSyncExternalStore: (_subscribe, snapshot) => snapshot() })
  let message = makeHabitSuggestionMessage()
  const actions: HabitSuggestionActions = {
    isCurrent: () => true,
    transition: update => { message = update(message) },
    preview: vi.fn(async () => ({ response: makeHabitSuggestionPreview() })),
    refine: vi.fn(async original => ({ ...original, title: 'Read one page' })),
  }
  const view = (online = true) => harness.render(() => {
    const part = message.parts![0]!
    if (part.type !== 'block' || part.kind !== 'habitSuggestions') throw new Error('Missing suggestion block')
    return useView(part.block, message, actions, online)
  })
  return { view, actions }
}

describe('habit suggestion view behavior', () => {
  it('keeps editing local and removes only the explicitly saved draft', () => {
    const { view, actions } = setup()
    expect(view().editing).toBeNull()
    view().edit(draft.id)
    expect(view().editing).toEqual(draft)
    actions.isCurrent = () => false
    view().applied(draft.id)
    expect(view().drafts).toHaveLength(2)
    actions.isCurrent = () => true
    view().applied(draft.id)
    expect(view().drafts.map(candidate => candidate.title)).toEqual(['Stretch'])
    view().edit(null)
    expect(view().editing).toBeNull()
  })
  it('reserves one preview and retries the remaining batch using the current cards', async () => {
    const { view, actions } = setup()
    expect(view(false).disabled).toBe(true)
    expect(view().available(draft.id)).toBe(true)
    await view().add(draft.id)
    expect(view().available(draft.id)).toBe(false)
    vi.mocked(actions.preview).mockRejectedValueOnce(new Error('Unavailable'))
    await view().addAll()
    expect(view().state.errors.all).toBe('chat.habitSuggestions.previewError')
    await view().retry('all')
    expect(vi.mocked(actions.preview).mock.lastCall?.[0].map(candidate => candidate.title)).toEqual(['Stretch'])
  })
  it('notifies subscribers, refines the chosen slot and ignores a missing slot', async () => {
    const { view, actions } = setup()
    const listener = vi.fn()
    const unsubscribe = view().controller.subscribe(listener)
    view().controller.tweak(draft.id)
    view().controller.setInstruction('one page')
    await view().refine(draft.id, view().state.instruction)
    expect(view().drafts[0]?.title).toBe('Read one page')
    expect(view().drafts[1]?.title).toBe('Stretch')
    expect(view().state.tweaking).toBeNull()
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    listener.mockClear()
    view().controller.tweak(draft.id)
    expect(listener).not.toHaveBeenCalled()
    await view().refine('missing', 'one page')
    expect(actions.refine).toHaveBeenCalledTimes(1)
  })
  it('preserves the slot and presents a retry when preview approval is unavailable', async () => {
    const { view, actions } = setup()
    const response = makeHabitSuggestionPreview()
    vi.mocked(actions.preview).mockResolvedValueOnce({ response: { ...response,
      operation: { ...response.operation, status: 'Denied' }, pendingOperation: null,
    } })
    await view().add(draft.id)
    expect(view().available(draft.id)).toBe(true)
    expect(view().state.errors[draft.id]).toBe('chat.habitSuggestions.previewError')
    await view().retry(draft.id)
    expect(view().available(draft.id)).toBe(false)
    await view().retry('missing')
    expect(actions.preview).toHaveBeenCalledTimes(2)
  })
  it('formats general and untimed drafts without adding clock values', () => {
    const displayTime = vi.fn((time: string) => time)
    expect(habitSuggestionSchedule({ ...draft, isGeneral: true }, 'en', key => key, displayTime)).toBe('habits.form.noSchedule')
    expect(habitSuggestionSchedule({ ...draft, dueDate: '', dueTime: '', dueEndTime: '' }, 'en', key => key, displayTime)).not.toContain('22:00')
    expect(displayTime).not.toHaveBeenCalled()
  })
  it('keeps the cadence and start date without empty clock separators for null times', () => {
    const displayTime = vi.fn((time: string) => time)
    expect(habitSuggestionSchedule(untimedDraft, 'en', key => key, displayTime))
      .toBe('habits.frequency.everyDay · 10/26/2026')
    expect(displayTime).not.toHaveBeenCalled()
  })
})
