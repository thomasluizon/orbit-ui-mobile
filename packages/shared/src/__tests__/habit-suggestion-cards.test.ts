import { describe, expect, it, vi } from 'vitest'
import { habitSuggestionDraftSchema } from '../types/habit-suggestions'
import { chatResponseSchema } from '../types/chat'
import { HabitSuggestionController, type HabitSuggestionActions } from '../chat/habit-suggestion-controller'
import { habitSuggestionCreateValues, habitSuggestionStatus } from '../chat/habit-suggestions'
import { habitSuggestionSchedule } from '../chat/habit-suggestion-view'
import { createTimeDisplay } from '../utils/locale-format'
import { buildChatClientContext } from '../chat/client-context'
import { habitSuggestionDraftFixture as draft, habitSuggestionsFixture as card, makeHabitSuggestionMessage, makeHabitSuggestionPreview } from '../test-support/habit-suggestion-fixtures'

function setup() {
  let message = makeHabitSuggestionMessage()
  const controller = new HabitSuggestionController()
  const actions: HabitSuggestionActions = {
    refine: vi.fn(async original => ({ ...original, title: 'Read one page' })),
    preview: vi.fn(async () => ({ response: makeHabitSuggestionPreview() })), isCurrent: () => true,
    transition: update => { message = update(message) },
  }
  return { controller, actions, message: () => message }
}

describe('habit suggestion contract and card state', () => {
  it('negotiates on both platforms and parses a block-only response', () => {
    for (const platform of ['web', 'mobile'] as const) expect(buildChatClientContext({ platform, locale: 'en' }).partKinds).toContain('habitSuggestions')
    expect(chatResponseSchema.parse({ actions: [], parts: makeHabitSuggestionMessage().parts }).parts?.[0]).toEqual(makeHabitSuggestionMessage().parts?.[0])
    expect(habitSuggestionDraftSchema.safeParse({ ...draft, dueTime: 22 }).success).toBe(false)
  })
  it('prefills type, schedule, checklist, emoji and reminders', () => {
    expect(habitSuggestionCreateValues(draft)).toMatchObject({ title: 'Read', itemType: 'habit', dueTime: '22:00', dueEndTime: '22:15',
      dueDate: draft.dueDate, frequencyUnit: 'Day', frequencyQuantity: 1, reminderEnabled: true, emoji: '📖', checklistItems: [{ text: 'Choose a book', isChecked: false }, { text: 'Read a page', isChecked: false }] })
    expect(habitSuggestionCreateValues({ ...draft, type: 'Task', frequencyUnit: null, frequencyQuantity: null, reminderMinutesBefore: null })).toMatchObject({ itemType: 'task', reminderEnabled: false })
  })
  it('uses the account clock preference for suggested and current times', () => {
    const display = createTimeDisplay('pt-BR', false)
    expect(habitSuggestionSchedule(draft, 'pt-BR', key => key, display.displayTime)).toContain('10:00 PM')
  })
  it('refines only one slot and retains the other draft identity', async () => {
    const { controller, actions, message } = setup()
    controller.tweak(card.drafts[1]!.id); controller.setInstruction('later in the evening')
    await controller.refine(draft, 'one page', actions)
    expect(controller.getSnapshot()).toMatchObject({ tweaking: card.drafts[1]!.id, instruction: 'later in the evening' })
    const part = message().parts?.[0]
    expect(part?.type === 'block' && part.kind === 'habitSuggestions' && part.block.drafts[1]).toBe(card.drafts[1])
    expect(actions.refine).toHaveBeenCalledExactlyOnceWith(draft, 'one page')
    expect(controller.getSnapshot().revisions[draft.id]).toBe(1)
  })
  it('retains the draft and instruction on refine failure and retries', async () => {
    const { controller, actions, message } = setup()
    vi.mocked(actions.refine).mockRejectedValueOnce(new Error('Unavailable'))
    controller.tweak(draft.id); controller.setInstruction('one page')
    await controller.refine(draft, 'one page', actions)
    expect(message()).toEqual(makeHabitSuggestionMessage())
    expect(controller.getSnapshot()).toMatchObject({ instruction: 'one page', errors: { [draft.id]: 'chat.habitSuggestions.refineError' } })
    await controller.retry(draft.id, message(), actions)
    expect(actions.refine).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().errors[draft.id]).toBe('')
  })
  it('holds a single preview and sends only remaining drafts for add all', async () => {
    const { controller, actions, message } = setup()
    await controller.preview([draft], false, message(), actions)
    expect(habitSuggestionStatus(message(), draft.id)).toBe('preview')
    expect(message().appliedHabitSuggestions).toBeUndefined()
    await controller.preview(card.drafts, true, message(), actions)
    expect(vi.mocked(actions.preview).mock.calls).toEqual([[[draft], false], [[card.drafts[1]], true]])
  })
  it('restores rejected previews and excludes completed and uncertain previews', async () => {
    const { controller, actions, message } = setup()
    await controller.preview(card.drafts, true, message(), actions)
    const operationId = makeHabitSuggestionPreview().pendingOperation!.id
    const withState = (state: NonNullable<ReturnType<typeof message>['pendingOperationStates']>[string]) => ({ ...message(), pendingOperationStates: { [operationId]: state } })
    expect(habitSuggestionStatus(withState({ rejected: true }), draft.id)).toBe('available')
    expect(habitSuggestionStatus(withState({ status: 'done' }), draft.id)).toBe('applied')
    expect(habitSuggestionStatus(withState({ status: 'done', dismissed: true }), draft.id)).toBe('applied')
    expect(habitSuggestionStatus(withState({ status: 'failed', dismissed: true, canRetry: false }), draft.id)).toBe('preview')
    expect(habitSuggestionStatus(withState({ status: 'failed', canRetry: false }), draft.id)).toBe('preview')
  })
  it('attaches batch conflicts to the indexed slot and retries without losing drafts', async () => {
    const { controller, actions, message } = setup()
    vi.mocked(actions.preview).mockResolvedValueOnce({ conflictIndex: 1 })
    await controller.preview(card.drafts, true, message(), actions)
    expect(message()).toEqual(makeHabitSuggestionMessage())
    expect(controller.getSnapshot().errors).toEqual({ [card.drafts[1]!.id]: 'chat.habitSuggestions.conflictError' })
    await controller.retry(card.drafts[1]!.id, message(), actions)
    expect(message().pendingOperations).toHaveLength(1)
  })
  it('prevents concurrent previews and ignores an account replacement', async () => {
    const { controller, actions, message } = setup()
    let deliver: (response: Awaited<ReturnType<HabitSuggestionActions['preview']>>) => void = () => {}
    vi.mocked(actions.preview).mockImplementationOnce(() => new Promise(resolve => { deliver = resolve }))
    const pending = controller.preview(card.drafts, true, message(), actions)
    await controller.preview(card.drafts, true, message(), actions)
    expect(actions.preview).toHaveBeenCalledTimes(1)
    actions.isCurrent = () => false
    deliver({ response: makeHabitSuggestionPreview() }); await pending
    expect(message().pendingOperations).toBeUndefined()
  })
})
