import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { habitSuggestionDraftFixture as draft, untimedHabitSuggestionDraftFixture as untimedDraft, habitSuggestionsFixture as card, makeHabitSuggestionMessage, makeHabitSuggestionPreview, makeHabitSuggestionBatchPreview } from '@orbit/shared/test-support/chat-fixtures'
import { useChatStore } from '@/stores/chat-store'
import { chatMessageSchema } from '@orbit/shared/types/chat'
import { getMessageBubbleOperations } from '@orbit/shared/chat'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { ChatBlock } from '@/components/chat/block-registry'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({ refine: vi.fn(), preview: vi.fn(), confirm: vi.fn(), revise: vi.fn(), relationshipsLoaded: true, scheduleLoaded: true, scheduleError: false, refetch: vi.fn(), create: vi.fn(), edit: vi.fn() }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-habit-suggestion-actions', () => ({ useHabitSuggestionActions: (id: string) => ({
  refine: mocks.refine, preview: mocks.preview, isCurrent: () => true,
  transition: (update: Parameters<ReturnType<typeof useChatStore.getState>['transitionMessage']>[1]) => useChatStore.getState().transitionMessage(id, update),
}) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitDetail: () => ({ data: mocks.scheduleLoaded ? { ...createMockHabit({ id: 'existing', dueTime: '06:00:00', dueEndTime: '06:15:00' }), children: [], ...(!mocks.relationshipsLoaded ? { linkedGoals: undefined, slipAlertEnabled: undefined } : {}) } : undefined, isError: mocks.scheduleError, refetch: mocks.refetch }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: (props: unknown) => { mocks.create(props); return <div role="dialog">Create form</div> } }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: (props: unknown) => { mocks.edit(props); return <div role="dialog">Edit form</div> } }))

function Harness({ isOnline = true }: { isOnline?: boolean }) {
  const message = useChatStore(state => state.messages[0]!)
  const part = message.parts?.[0]
  const operations = getMessageBubbleOperations({ message, onPendingOperationConfirmExecute: mocks.confirm, onPendingOperationRevise: mocks.revise, onPendingOperationPrepareStepUp: () => Promise.resolve({ ok: false as const }), onPendingOperationVerifyStepUp: () => Promise.resolve({ ok: false as const }) }, useChatStore.getState().transitionMessage)
  return part?.type === 'block' && part.kind === 'habitSuggestions' ? <>{operations.pendingOperations.map(({ key, ...operation }) => <PendingOperationCard key={key} {...operation} />)}<ChatBlock part={part} message={message} interaction={{ isOnline, isSending: false, atMessageLimit: false, allowance: 10, send: () => Promise.resolve({ ok: true }) }} onActionChipClick={undefined} /></> : null
}
function mount(locale = 'en', isOnline = true) { return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><Harness isOnline={isOnline} /></NextIntlClientProvider>) }
const click = async (name: string, index = 0) => { await act(async () => { fireEvent.click(screen.getAllByRole('button', { name })[index]!) }) }
beforeEach(() => {
  vi.clearAllMocks(); mocks.relationshipsLoaded = true; mocks.scheduleLoaded = true; mocks.scheduleError = false; useChatStore.setState({ messages: [makeHabitSuggestionMessage()] })
  mocks.refine.mockReset().mockResolvedValue({ ...draft, title: 'Read one page' })
  mocks.preview.mockReset().mockResolvedValue({ response: makeHabitSuggestionPreview() })
  mocks.confirm.mockReset().mockResolvedValue({ ok: true, response: { operation: { ...makeHabitSuggestionPreview().operation, status: 'Succeeded' } } })
})
afterEach(cleanup)

describe('habit suggestion actions on web', () => {
  it.each(['Add', 'Add all'])('renders an untimed card and preserves null times through %s', async action => {
    useChatStore.setState({ messages: [chatMessageSchema.parse(makeHabitSuggestionMessage([untimedDraft, card.drafts[1]!]))] })
    mount()
    expect(screen.getByText('Every day · 10/26/2026')).toBeInTheDocument()
    await click(action)
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(action === 'Add' ? [untimedDraft] : [untimedDraft, card.drafts[1]!], action === 'Add all')
    expect(useChatStore.getState().messages[0]?.pendingOperations).toHaveLength(1)
  })
  it('opens the create form with an untimed draft', async () => {
    useChatStore.setState({ messages: [chatMessageSchema.parse(makeHabitSuggestionMessage([untimedDraft]))] })
    mount(); await click('Edit'); await screen.findByRole('dialog')
    expect(mocks.create.mock.lastCall?.[0]).toMatchObject({ initialSuggestion: untimedDraft })
  })
  it.each(['Tweak', 'Swap'])('keeps an untimed replacement actionable after %s', async action => {
    const refined = { ...untimedDraft, title: 'Read one page' }
    mocks.refine.mockResolvedValueOnce(refined)
    mount(); await click(action)
    if (action === 'Tweak') {
      fireEvent.change(screen.getByRole('textbox', { name: 'Tweak this habit...' }), { target: { value: 'without a time' } })
      await click('Apply')
    }
    expect(screen.getByRole('button', { name: refined.title })).toBeInTheDocument()
    expect(screen.getByText('Every day · 10/26/2026')).toBeInTheDocument()
    await click('Add')
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith([refined], false)
  })
  it.each(['en', 'pt-BR'])('renders the app habit rows with bilingual actions in %s', locale => {
    mount(locale)
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument()
    expect(screen.getAllByText(draft.reason)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: locale === 'en' ? 'Add' : 'Adicionar' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: locale === 'en' ? 'Add all' : 'Adicionar todos' })).toBeInTheDocument()
  })
  it('Add requests one approved preview and Add all requests one preview of the remaining drafts', async () => {
    mount(); await click('Add')
    expect(mocks.preview).toHaveBeenNthCalledWith(1, [draft], false)
    expect(useChatStore.getState().messages[0]?.pendingOperations).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Add' })[0]).toBeDisabled()
    await click('Add all')
    expect(mocks.preview).toHaveBeenCalledTimes(2)
    expect(mocks.preview.mock.calls[1]![0]).toEqual([expect.objectContaining({ title: 'Stretch' })])
    expect(mocks.preview.mock.calls[1]![1]).toBe(true)
  })
  it('approves a requested preview once through the existing preview card', async () => {
    mount(); await click('Add')
    expect(mocks.confirm).not.toHaveBeenCalled()
    await click('Create habit')
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith('suggestion-preview')
    expect(screen.queryByRole('button', { name: 'Read' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stretch' })).toBeInTheDocument()
  })
  it('keeps a removed batch draft available after persisted revision and approval', async () => {
    const response = makeHabitSuggestionBatchPreview()
    mocks.preview.mockResolvedValueOnce({ response })
    mocks.revise.mockResolvedValueOnce({ ok: true, result: { success: true, preview: {
      changes: [], changeTargetCount: 1, previewFingerprint: 'revised',
      items: [{ ...response.pendingOperation!.items![1]!, itemId: '0/0' }],
    } } })
    const mounted = mount(); await click('Add all'); await click('Remove Read')
    expect(screen.getAllByRole('button', { name: 'Add' })[0]).toBeEnabled()
    expect(screen.getAllByRole('button', { name: 'Add' })[1]).toBeDisabled()
    const saved = JSON.stringify(useChatStore.getState().messages[0])
    mounted.unmount()
    useChatStore.setState({ messages: [chatMessageSchema.parse({ ...JSON.parse(saved), timestamp: new Date(JSON.parse(saved).timestamp) })] })
    mount(); await click('Approve')
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(response.pendingOperation!.id)
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-suggestion-id]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })
  it.each(['Tweak', 'Swap'])('retries Add all with the current card after %s', async action => {
    mocks.preview.mockRejectedValueOnce(new Error('Unavailable'))
    mount(); await click('Add all'); await click(action)
    if (action === 'Tweak') {
      fireEvent.change(screen.getByRole('textbox', { name: 'Tweak this habit...' }), { target: { value: 'one page' } })
      await click('Apply')
    }
    await click('Retry')
    expect(mocks.preview.mock.lastCall?.[0][0]).toEqual({ ...draft, title: 'Read one page' })
  })
  it('Edit opens the existing habit form carrying the complete draft', async () => {
    mount(); await click('Edit')
    expect(await screen.findByRole('dialog')).toHaveTextContent('Create form')
    expect(mocks.create.mock.lastCall?.[0]).toMatchObject({ open: true, initialSuggestion: draft })
  })
  it('removes a saved draft and closes its editor through the form callbacks', async () => {
    mount(); await click('Edit')
    await screen.findByRole('dialog')
    const callbacks = mocks.create.mock.lastCall![0] as { onCreated: () => void; onOpenChange: (open: boolean) => void }
    await act(async () => { callbacks.onCreated(); callbacks.onOpenChange(false) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Read' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stretch' })).toBeInTheDocument()
  })
  it('disables suggestion actions and explains offline state through the block registry', () => {
    mount('en', false)
    for (const name of ['Add', 'Edit', 'Tweak', 'Swap', 'Add all']) {
      for (const button of screen.getAllByRole('button', { name })) expect(button).toBeDisabled()
    }
    expect(screen.getByText(en.chat.habitSuggestions.offline)).toBeVisible()
  })
  it('omits suggestions when their owning message is absent', () => {
    const part = makeHabitSuggestionMessage().parts![0]!
    if (part.type !== 'block' || part.kind !== 'habitSuggestions') throw new Error('Expected suggestions')
    const mounted = render(<ChatBlock part={part} onActionChipClick={undefined} />)
    expect(mounted.container).toBeEmptyDOMElement()
  })
  it.each([false, true])('shows the existing schedule loading or failure state with isError=%s', async isError => {
    mocks.scheduleLoaded = false; mocks.scheduleError = isError
    const message = makeHabitSuggestionMessage()
    message.parts = [{ type: 'block', kind: 'habitSuggestions', block: { language: 'en', drafts: [{ ...draft, existingHabitId: '33333333-3333-4333-8333-333333333333' }] } }]
    useChatStore.setState({ messages: [message] }); mount()
    expect(screen.getByText(isError ? en.chat.habitSuggestions.scheduleError : en.common.loading)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    if (isError) { await click('Retry'); expect(mocks.refetch).toHaveBeenCalledOnce() }
  })
  it('Tweak sends the draft and inline instruction and replaces only that card', async () => {
    mount(); const other = screen.getByRole('button', { name: 'Stretch' })
    await click('Tweak')
    fireEvent.change(screen.getByRole('textbox', { name: 'Tweak this habit...' }), { target: { value: 'one page' } })
    await click('Apply')
    expect(mocks.refine).toHaveBeenCalledExactlyOnceWith(draft, 'one page')
    expect(screen.getByRole('button', { name: 'Read one page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stretch' })).toBe(other)
  })
  it('Swap asks for a different idea in the selected slot', async () => {
    mount(); await click('Swap')
    expect(mocks.refine).toHaveBeenCalledExactlyOnceWith(draft, en.chat.habitSuggestions.swapInstruction)
    expect(screen.getByRole('button', { name: 'Stretch' })).toBeInTheDocument()
  })
  it('refine failure keeps the original card and offers a working retry', async () => {
    mocks.refine.mockRejectedValueOnce(new Error('Unavailable'))
    mount(); await click('Swap')
    expect(screen.getByText(en.chat.habitSuggestions.refineError)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument()
    await click('Retry')
    expect(screen.getByRole('button', { name: 'Read one page' })).toBeInTheDocument()
  })
  it('shows a batch conflict on that card and leaves every draft available', async () => {
    mocks.preview.mockResolvedValueOnce({ conflictIndex: 1 })
    mount(); await click('Add all')
    const second = screen.getByRole('button', { name: 'Stretch' }).closest('[data-suggestion-id]') as HTMLElement
    expect(within(second).getByText(en.chat.habitSuggestions.conflictError)).toBeVisible()
    expect(useChatStore.getState().messages[0]?.pendingOperations).toBeUndefined()
    await click('Retry')
    expect(mocks.preview).toHaveBeenCalledTimes(2)
  })
  it('shows the current schedule next to an adjustment and opens the edit form', async () => {
    const message = makeHabitSuggestionMessage()
    mocks.relationshipsLoaded = false
    const adjustment = { ...draft, existingHabitId: '33333333-3333-4333-8333-333333333333' }
    message.parts = [{ type: 'block', kind: 'habitSuggestions', block: { language: 'pt-BR', drafts: [adjustment] } }]
    useChatStore.setState({ messages: [message] }); mount('pt-BR')
    expect(screen.getByText('Já existe')).toBeInTheDocument()
    expect(screen.getByText('Atual')).toBeInTheDocument()
    expect(screen.getByText(/6:00/)).toBeInTheDocument()
    await click('Editar')
    expect(mocks.edit.mock.lastCall?.[0]).toMatchObject({ initialSuggestion: adjustment, relationshipFieldsLoaded: false })
  })
})
