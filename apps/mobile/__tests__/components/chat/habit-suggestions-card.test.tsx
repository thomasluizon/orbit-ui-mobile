import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestRenderer } from 'react-test-renderer'
import { habitSuggestionDraftFixture as draft, makeHabitSuggestionMessage, makeHabitSuggestionPreview } from '@orbit/shared/test-support/chat-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { useChatStore } from '@/stores/chat-store'
import { getMessageBubbleOperations } from '@orbit/shared/chat'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { HabitSuggestionsCard } from '@/components/chat/habit-suggestions-card'
import { i18n } from '@/lib/i18n'
import { controlName } from '../../support/react-test-renderer'
import en from '@orbit/shared/i18n/en.json'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const mocks = vi.hoisted(() => ({ refine: vi.fn(), preview: vi.fn(), confirm: vi.fn(), relationshipsLoaded: true, create: vi.fn(), edit: vi.fn() }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-habit-suggestion-actions', () => ({ useHabitSuggestionActions: (id: string) => ({
  refine: mocks.refine, preview: mocks.preview, isCurrent: () => true,
  transition: (update: Parameters<ReturnType<typeof useChatStore.getState>['transitionMessage']>[1]) => useChatStore.getState().transitionMessage(id, update),
}) }))
vi.mock('@/hooks/use-habits', () => ({ useHabitDetail: () => ({ data: { ...createMockHabit({ id: 'existing', dueTime: '06:00:00', dueEndTime: '06:15:00' }), children: [], ...(!mocks.relationshipsLoaded ? { linkedGoals: undefined, slipAlertEnabled: undefined } : {}) }, isError: false }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: (props: unknown) => { mocks.create(props); return null } }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: (props: unknown) => { mocks.edit(props); return null } }))
let tree: ReactTestRenderer & { toJSON: () => unknown; unmount: () => void }
function Harness() {
  const message = useChatStore(state => state.messages[0]!)
  const part = message.parts?.[0]
  const operations = getMessageBubbleOperations({ message, onPendingOperationConfirmExecute: mocks.confirm, onPendingOperationPrepareStepUp: () => Promise.resolve({ ok: false as const }), onPendingOperationVerifyStepUp: () => Promise.resolve({ ok: false as const }) }, useChatStore.getState().transitionMessage)
  return part?.type === 'block' && part.kind === 'habitSuggestions' ? <>{operations.pendingOperations.map(({ key, ...operation }) => <PendingOperationCard key={key} {...operation} />)}<HabitSuggestionsCard card={part.block} message={message} /></> : null
}
async function mount() { await renderer.act(() => { tree = renderer.create(<Harness />) as typeof tree }) }
const content = () => JSON.stringify(tree.toJSON())
const buttons = (name: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === name || controlName(node) === name))
async function press(name: string, index = 0) { await renderer.act(async () => { (buttons(name)[index]!.props.onPress as () => void)(); await Promise.resolve() }) }
beforeEach(async () => {
  vi.clearAllMocks(); mocks.relationshipsLoaded = true; useChatStore.setState({ messages: [makeHabitSuggestionMessage()] })
  mocks.refine.mockReset().mockResolvedValue({ ...draft, title: 'Read one page' })
  mocks.preview.mockReset().mockResolvedValue({ response: makeHabitSuggestionPreview() })
  mocks.confirm.mockReset().mockResolvedValue({ ok: true, response: { operation: { ...makeHabitSuggestionPreview().operation, status: 'Succeeded' } } })
  await i18n.changeLanguage('en')
})
afterEach(async () => { await renderer.act(() => tree.unmount()); await i18n.changeLanguage('en') })

describe('habit suggestion actions on Android', () => {
  it.each(['en', 'pt-BR'])('renders habit rows and localized actions in %s', async locale => {
    await i18n.changeLanguage(locale); await mount()
    expect(buttons('Read')).toHaveLength(1)
    expect(content()).toContain(draft.reason)
    expect(buttons(locale === 'en' ? 'Add' : 'Adicionar')).toHaveLength(2)
    expect(buttons(locale === 'en' ? 'Add all' : 'Adicionar todos')).toHaveLength(1)
  })
  it('Add requests a held preview and Add all previews remaining drafts once', async () => {
    await mount(); await press('Add')
    expect(mocks.preview).toHaveBeenNthCalledWith(1, [draft], false)
    expect(useChatStore.getState().messages[0]?.pendingOperations).toHaveLength(1)
    expect(buttons('Add')[0]?.props.accessibilityState).toMatchObject({ disabled: true })
    await press('Add all')
    expect(mocks.preview).toHaveBeenCalledTimes(2)
    expect(mocks.preview.mock.calls[1]![0]).toEqual([expect.objectContaining({ title: 'Stretch' })])
    expect(mocks.preview.mock.calls[1]![1]).toBe(true)
  })
  it('approves a requested preview once through the existing preview card', async () => {
    await mount(); await press('Add')
    expect(mocks.confirm).not.toHaveBeenCalled()
    await press('Create habit')
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith('suggestion-preview')
    expect(buttons('Read')).toHaveLength(0)
    expect(buttons('Stretch')).toHaveLength(1)
  })
  it('Edit opens the existing form with the full draft', async () => {
    await mount(); await press('Edit')
    expect(mocks.create.mock.lastCall?.[0]).toMatchObject({ open: true, initialSuggestion: draft })
  })
  it('Tweak sends the inline instruction and replaces only that card', async () => {
    await mount(); const other = buttons('Stretch')[0]
    await press('Tweak')
    const field = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === en.chat.habitSuggestions.prompt && typeof node.props.onChangeText === 'function')[0]!
    await renderer.act(() => { (field.props.onChangeText as (value: string) => void)('one page') })
    await press('Apply')
    expect(mocks.refine).toHaveBeenCalledExactlyOnceWith(draft, 'one page')
    expect(buttons('Read one page')).toHaveLength(1)
    expect(buttons('Stretch')[0]).toBe(other)
  })
  it('Swap requests a different idea for the selected slot', async () => {
    await mount(); await press('Swap')
    expect(mocks.refine).toHaveBeenCalledExactlyOnceWith(draft, en.chat.habitSuggestions.swapInstruction)
    expect(buttons('Stretch')).toHaveLength(1)
  })
  it('keeps the original card on refine failure with a working retry', async () => {
    mocks.refine.mockRejectedValueOnce(new Error('Unavailable'))
    await mount(); await press('Swap')
    expect(content()).toContain(en.chat.habitSuggestions.refineError)
    expect(buttons('Read')).toHaveLength(1)
    await press('Retry')
    expect(buttons('Read one page')).toHaveLength(1)
  })
  it('places an add-all conflict under the failed card and retries', async () => {
    mocks.preview.mockResolvedValueOnce({ conflictIndex: 1 })
    await mount(); await press('Add all')
    expect(content()).toContain(en.chat.habitSuggestions.conflictError)
    expect(useChatStore.getState().messages[0]?.pendingOperations).toBeUndefined()
    expect(buttons('Read')).toHaveLength(1)
    await press('Retry'); expect(mocks.preview).toHaveBeenCalledTimes(2)
  })
  it('shows the current and proposed schedules and edits the existing habit', async () => {
    const message = makeHabitSuggestionMessage()
    mocks.relationshipsLoaded = false
    const adjustment = { ...draft, existingHabitId: '33333333-3333-4333-8333-333333333333' }
    message.parts = [{ type: 'block', kind: 'habitSuggestions', block: { language: 'pt-BR', drafts: [adjustment] } }]
    useChatStore.setState({ messages: [message] }); await i18n.changeLanguage('pt-BR'); await mount()
    expect(content()).toContain('Já existe'); expect(content()).toContain('Atual'); expect(content()).toContain('6:00')
    await press('Editar')
    expect(mocks.edit.mock.lastCall?.[0]).toMatchObject({ initialSuggestion: adjustment, relationshipFieldsLoaded: false })
  })
})
