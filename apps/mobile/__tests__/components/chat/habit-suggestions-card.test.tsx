import React from 'react'
import { View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestRenderer } from 'react-test-renderer'
import { habitSuggestionDraftFixture as draft, untimedHabitSuggestionDraftFixture as untimedDraft, habitSuggestionsFixture as card, makeHabitSuggestionMessage, makeHabitSuggestionPreview, makeHabitSuggestionBatchPreview } from '@orbit/shared/test-support/chat-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { useChatStore } from '@/stores/chat-store'
import { chatMessageSchema } from '@orbit/shared/types/chat'
import { getMessageBubbleOperations } from '@orbit/shared/chat'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { ChatBlock } from '@/components/chat/block-registry'
import { i18n } from '@/lib/i18n'
import { controlName } from '../../support/react-test-renderer'
import en from '@orbit/shared/i18n/en.json'

vi.unmock('react-i18next')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: vi.fn(), useLogHabit: vi.fn(), useHabitMetrics: vi.fn() }))
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const mocks = vi.hoisted(() => ({ refine: vi.fn(), preview: vi.fn(), confirm: vi.fn(), revise: vi.fn(), relationshipsLoaded: true, scheduleLoaded: true, scheduleError: false, refetch: vi.fn(), create: vi.fn(), edit: vi.fn() }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-habit-suggestion-actions', () => ({ useHabitSuggestionActions: (id: string) => ({
  refine: mocks.refine, preview: mocks.preview, isCurrent: () => true,
  transition: (update: Parameters<ReturnType<typeof useChatStore.getState>['transitionMessage']>[1]) => useChatStore.getState().transitionMessage(id, update),
}) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitDetail: () => ({ data: mocks.scheduleLoaded ? { ...createMockHabit({ id: 'existing', dueTime: '06:00:00', dueEndTime: '06:15:00' }), children: [], ...(!mocks.relationshipsLoaded ? { linkedGoals: undefined, slipAlertEnabled: undefined } : {}) } : undefined, isError: mocks.scheduleError, refetch: mocks.refetch }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: (props: unknown) => { mocks.create(props); return <View testID="suggestion-editor" /> } }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: (props: unknown) => { mocks.edit(props); return null } }))
let tree: ReactTestRenderer & { toJSON: () => unknown; unmount: () => void }
function Harness({ isOnline = true }: { isOnline?: boolean }) {
  const message = useChatStore(state => state.messages[0]!)
  const part = message.parts?.[0]
  const operations = getMessageBubbleOperations({ message, onPendingOperationConfirmExecute: mocks.confirm, onPendingOperationRevise: mocks.revise, onPendingOperationPrepareStepUp: () => Promise.resolve({ ok: false as const }), onPendingOperationVerifyStepUp: () => Promise.resolve({ ok: false as const }) }, useChatStore.getState().transitionMessage)
  return part?.type === 'block' && part.kind === 'habitSuggestions' ? <>{operations.pendingOperations.map(({ key, ...operation }) => <PendingOperationCard key={key} {...operation} />)}<ChatBlock part={part} message={message} interaction={{ isOnline, isSending: false, atMessageLimit: false, allowance: 10, send: () => Promise.resolve({ ok: true }) }} onActionChipClick={undefined} /></> : null
}
async function mount(isOnline = true) { await renderer.act(() => { tree = renderer.create(<Harness isOnline={isOnline} />) as typeof tree }) }
const content = () => JSON.stringify(tree.toJSON())
const buttons = (name: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === name || controlName(node) === name))
async function press(name: string, index = 0) { await renderer.act(async () => { (buttons(name)[index]!.props.onPress as () => void)(); await Promise.resolve() }) }
beforeEach(async () => {
  vi.clearAllMocks(); mocks.relationshipsLoaded = true; mocks.scheduleLoaded = true; mocks.scheduleError = false; useChatStore.setState({ messages: [makeHabitSuggestionMessage()] })
  mocks.refine.mockReset().mockResolvedValue({ ...draft, title: 'Read one page' })
  mocks.preview.mockReset().mockResolvedValue({ response: makeHabitSuggestionPreview() })
  mocks.confirm.mockReset().mockResolvedValue({ ok: true, response: { operation: { ...makeHabitSuggestionPreview().operation, status: 'Succeeded' } } })
  await i18n.changeLanguage('en')
})
afterEach(async () => { await renderer.act(() => tree.unmount()); await i18n.changeLanguage('en') })

describe('habit suggestion actions on Android', () => {
  it.each(['Add', 'Add all'])('renders an untimed card and preserves null times through %s', async action => {
    useChatStore.setState({ messages: [chatMessageSchema.parse(makeHabitSuggestionMessage([untimedDraft, card.drafts[1]!]))] })
    await mount()
    expect(content()).toContain('Every day · 10/26/2026')
    await press(action)
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(action === 'Add' ? [untimedDraft] : [untimedDraft, card.drafts[1]!], action === 'Add all')
    expect(useChatStore.getState().messages[0]?.pendingOperations).toHaveLength(1)
  })
  it('opens the create form with an untimed draft', async () => {
    useChatStore.setState({ messages: [chatMessageSchema.parse(makeHabitSuggestionMessage([untimedDraft]))] })
    await mount(); await press('Edit')
    await renderer.act(async () => { await import('@/components/chat/habit-suggestion-editor') })
    expect(mocks.create.mock.lastCall?.[0]).toMatchObject({ initialSuggestion: untimedDraft })
  })
  it.each(['Tweak', 'Swap'])('keeps an untimed replacement actionable after %s', async action => {
    const refined = { ...untimedDraft, title: 'Read one page' }
    mocks.refine.mockResolvedValueOnce(refined)
    await mount(); await press(action)
    if (action === 'Tweak') {
      const field = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === en.chat.habitSuggestions.prompt && typeof node.props.onChangeText === 'function')[0]!
      await renderer.act(() => { (field.props.onChangeText as (value: string) => void)('without a time') })
      await press('Apply')
    }
    expect(buttons(refined.title)).toHaveLength(1)
    expect(content()).toContain('Every day · 10/26/2026')
    await press('Add')
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith([refined], false)
  })
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
  it('keeps a removed batch draft available after persisted revision and approval', async () => {
    const response = makeHabitSuggestionBatchPreview()
    mocks.preview.mockResolvedValueOnce({ response })
    mocks.revise.mockResolvedValueOnce({ ok: true, result: { success: true, preview: {
      changes: [], changeTargetCount: 1, previewFingerprint: 'revised',
      items: [{ ...response.pendingOperation!.items![1]!, itemId: '0/0' }],
    } } })
    await mount(); await press('Add all'); await press('Remove Read')
    expect(buttons('Add')[0]?.props.accessibilityState).toMatchObject({ disabled: false })
    expect(buttons('Add')[1]?.props.accessibilityState).toMatchObject({ disabled: true })
    const saved = JSON.stringify(useChatStore.getState().messages[0])
    await renderer.act(() => tree.unmount())
    useChatStore.setState({ messages: [chatMessageSchema.parse({ ...JSON.parse(saved), timestamp: new Date(JSON.parse(saved).timestamp) })] })
    await mount(); await press('Approve')
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(response.pendingOperation!.id)
    expect(buttons('Read')).toHaveLength(1)
    expect(tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.testID === 'string' && node.props.testID.startsWith('suggestion-'))).toHaveLength(1)
    expect(buttons('Add')[0]?.props.accessibilityState).toMatchObject({ disabled: false })
  })
  it.each(['Tweak', 'Swap'])('retries Add all with the current card after %s', async action => {
    mocks.preview.mockRejectedValueOnce(new Error('Unavailable'))
    await mount(); await press('Add all'); await press(action)
    if (action === 'Tweak') {
      const field = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === en.chat.habitSuggestions.prompt && typeof node.props.onChangeText === 'function')[0]!
      await renderer.act(() => { (field.props.onChangeText as (value: string) => void)('one page') })
      await press('Apply')
    }
    await press('Retry')
    expect(mocks.preview.mock.lastCall?.[0][0]).toEqual({ ...draft, title: 'Read one page' })
  })
  it('Edit opens the existing form with the full draft', async () => {
    await mount(); await press('Edit')
    await renderer.act(async () => { await import('@/components/chat/habit-suggestion-editor') })
    expect(mocks.create.mock.lastCall?.[0]).toMatchObject({ open: true, initialSuggestion: draft })
  })
  it('removes a saved draft and closes its editor through the form callbacks', async () => {
    await mount(); await press('Edit')
    await renderer.act(async () => { await import('@/components/chat/habit-suggestion-editor') })
    const callbacks = mocks.create.mock.lastCall![0] as { onCreated: () => void; onClose: () => void }
    await renderer.act(() => { callbacks.onCreated(); callbacks.onClose() })
    expect(buttons('Read')).toHaveLength(0)
    expect(buttons('Stretch')).toHaveLength(1)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'suggestion-editor')).toHaveLength(0)
  })
  it('disables suggestion actions and explains offline state through the block registry', async () => {
    await mount(false)
    for (const name of ['Add', 'Edit', 'Tweak', 'Swap', 'Add all']) {
      for (const button of buttons(name)) expect(button.props.accessibilityState).toMatchObject({ disabled: true })
    }
    expect(content()).toContain(en.chat.habitSuggestions.offline)
  })
  it('omits suggestions when their owning message is absent', async () => {
    const part = makeHabitSuggestionMessage().parts![0]!
    if (part.type !== 'block' || part.kind !== 'habitSuggestions') throw new Error('Expected suggestions')
    await renderer.act(() => { tree = renderer.create(<ChatBlock part={part} onActionChipClick={undefined} />) as typeof tree })
    expect(tree.toJSON()).toBeNull()
  })
  it.each([false, true])('shows the existing schedule loading or failure state with isError=%s', async isError => {
    mocks.scheduleLoaded = false; mocks.scheduleError = isError
    const message = makeHabitSuggestionMessage()
    message.parts = [{ type: 'block', kind: 'habitSuggestions', block: { language: 'en', drafts: [{ ...draft, existingHabitId: '33333333-3333-4333-8333-333333333333' }] } }]
    useChatStore.setState({ messages: [message] }); await mount()
    expect(content()).toContain(isError ? en.chat.habitSuggestions.scheduleError : en.common.loading)
    expect(buttons('Edit')[0]?.props.accessibilityState).toMatchObject({ disabled: true })
    if (isError) { await press('Retry'); expect(mocks.refetch).toHaveBeenCalledOnce() }
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
    await renderer.act(async () => { await import('@/components/chat/habit-suggestion-editor') })
    expect(mocks.edit.mock.lastCall?.[0]).toMatchObject({ initialSuggestion: adjustment, relationshipFieldsLoaded: false })
  })
})
