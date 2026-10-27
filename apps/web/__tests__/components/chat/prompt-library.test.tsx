import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PresenceContext } from 'motion/react'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { buildComposerChips } from '@orbit/shared/chat'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { PROMPT_CATEGORIES, PROMPT_TEMPLATES, PROMPT_PRESENTATION } from '@orbit/shared/chat/prompt-library'
import { CatalogIdea } from '@/components/chat/prompt-idea'
import { PromptLibrary } from '@/components/chat/prompt-library'
import { AstraConversation } from '@/components/chat/conversation'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

afterEach(() => {
  cleanup()
  useChatStore.setState({ messages: [] })
  useChatStore.getState().setDraft('')
  useChatStore.getState().setContextualSuggestion(null)
  useUIStore.getState().setAstraConversationOpen(false)
})

function Harness({ send = vi.fn(), state = 'idle', recording = false }: Readonly<{ send?: ReturnType<typeof vi.fn>; state?: 'idle' | 'offline' | 'atLimit'; recording?: boolean }>) {
  const value = useChatStore(store => store.draft)
  const messages = useChatStore(store => store.messages)
  const composerProps: ComposerProps = {
    words: { placeholder: 'Ask Astra', send: 'Send', paste: 'Paste', nothingToPaste: 'Nothing to paste', clear: 'Clear message', inputLabel: 'Message', actions: 'Attach', suggestionsLabel: 'Suggestions' },
    value, onChangeValue: useChatStore.getState().setDraft, onSend: vi.fn(), suggestions: [],
    ...(recording ? { state: 'recording', onVoice: vi.fn(), voiceWords: { start: 'Start', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' } } : state === 'idle' ? { state } : state === 'offline' ? { state: 'offline', limitReason: 'You are offline' } : { state: 'atLimit', limitReason: 'Daily limit reached' }),
  }
  const chat = {
    threadScroll: createChatThreadScroll(), chatContainerRef: createRef<HTMLDivElement>(), scrollToBottom: vi.fn(),
    messages, isOnline: state !== 'offline', atMessageLimit: state === 'atLimit', aiMessagesLimit: 5, activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: messages.length === 0,
    isSending: false, canShowFollowUps: false, hasProAccess: true, hasGoogleConnection: true,
    sendMessage: send, composerProps,
  } as unknown as Parameters<typeof AstraConversation>[0]['chat']
  return <AstraConversation chat={chat} />
}

function conversation(send = vi.fn(), state: 'idle' | 'offline' | 'atLimit' = 'idle') {
  useUIStore.getState().setAstraConversationOpen(true)
  return render(<NextIntlClientProvider locale="en" messages={en}><Harness send={send} state={state} /></NextIntlClientProvider>)
}

it('loads the library on demand, then fills a slot and sends a complete idea', async () => {
  const send = vi.fn()
  conversation(send)
  expect(screen.queryByRole('heading', { name: 'Ideas' })).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  expect(screen.queryByRole('heading', { name: 'Ideas' })).toBeNull()
  expect(screen.queryByRole('progressbar')).toBeNull()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }))
  fireEvent.click(screen.getByRole('button', { name: 'Set a reminder' }))
  const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  expect(input).toHaveValue('Remind me to {habit} at {time}.')
  await waitFor(() => expect(input).toHaveFocus())
  expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe('{habit}')
  expect(send).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
  const library = screen.getByRole('heading', { name: 'Ideas' }).closest('[data-prompt-library]')!
  fireEvent.click(screen.getByRole('button', { name: 'Return after a hard week' }))
  expect(send).toHaveBeenCalledExactlyOnceWith('Help me restart after a difficult week.')
  expect(library).toBeInTheDocument()
  expect(library).toHaveAttribute('inert')
  expect(library).toHaveAttribute('aria-hidden', 'true')
  await waitFor(() => expect(library).not.toBeInTheDocument())
  expect(input).toHaveValue('Remind me to {habit} at {time}.')
})

it.each([0, 1])('opens from trigger %s, focuses the heading, and returns on Escape with the draft and trigger focus', async index => {
  useChatStore.getState().setDraft('My unfinished thought')
  conversation()
  const trigger = screen.getAllByRole('button', { name: 'Browse ideas' })[index]!
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search ideas' }), { target: { value: 'week' } })
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.queryByRole('heading', { name: 'Ideas' })).toBeNull()
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('My unfinished thought')
})

it('returns with a selected editable slot, and sends a slot-free restart exactly once', async () => {
  const send = vi.fn()
  conversation(send)
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }))
  fireEvent.click(screen.getByRole('button', { name: 'Set a reminder' }))
  const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  expect(input).toHaveValue('Remind me to {habit} at {time}.')
  await waitFor(() => expect(input).toHaveFocus())
  expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe('{habit}')
  expect(send).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
  fireEvent.click(screen.getByRole('button', { name: 'Return after a hard week' }))
  expect(send).toHaveBeenCalledExactlyOnceWith('Help me restart after a difficult week.')
  expect(input).toHaveValue('Remind me to {habit} at {time}.')
})

it('keeps a draft and retains the selected idea until the draft is cleared', async () => {
  useChatStore.getState().setDraft('Keep my words')
  conversation()
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[1]!)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }))
  fireEvent.click(screen.getByRole('button', { name: 'Set a reminder' }))
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Keep my words')
  expect(screen.getByRole('button', { name: 'Set a reminder' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Set a reminder' }))
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Remind me to {habit} at {time}.')
})

it.each(['offline', 'atLimit'] as const)('disables every idea and shows the reason at %s', async state => {
  const send = vi.fn()
  conversation(send, state)
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  expect(within(document.querySelector<HTMLElement>('[data-prompt-library]')!).getByText(state === 'offline' ? en.shell.composer.offline.reason : createTranslator({ locale: 'en', messages: en })('shell.composer.limit.reason', { allowance: 5 }))).toBeInTheDocument()
  const row = screen.getByRole('button', { name: 'Plan my morning' })
  expect(row).toBeDisabled()
  fireEvent.click(row)
  expect(send).not.toHaveBeenCalled()
})

it('searches every category in the current language, paginates, and clears a miss', async () => {
  const { PromptLibrary } = await import('@/components/chat/prompt-library')
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><PromptLibrary onBack={vi.fn()} onSelect={vi.fn()} suggestions={[]} hasProAccess hasGoogleConnection /></NextIntlClientProvider>)
  await waitFor(() => expect(screen.getByRole('region', { name: 'Começar' })).toBeVisible())
  expect(screen.queryByRole('heading', { name: 'Entender' })).toBeNull()
  const search = screen.getByRole('searchbox', { name: 'Buscar ideias' })
  fireEvent.change(search, { target: { value: 'congelamentos da sequencia' } })
  expect(screen.getByRole('heading', { name: 'Entender' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Entender os congelamentos' })).toBeVisible()
  fireEvent.change(search, { target: { value: 'me ajude' } })
  expect(screen.getByRole('button', { name: 'Mais ideias' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Mais ideias' }))
  expect(screen.getByRole('button', { name: 'Ideias anteriores' })).toBeEnabled()
  fireEvent.change(search, { target: { value: 'sem resultado' } })
  expect(screen.getByText('Nenhuma ideia para “sem resultado”.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
  expect(search).toHaveValue('')
  expect(screen.getByRole('region', { name: 'Começar' })).toBeVisible()
})

it.each([[false, false], [false, true], [true, false]])('excludes Calendar from the filter and search with Pro %s and Google %s', async (hasProAccess, hasGoogleConnection) => {
  const { PromptLibrary } = await import('@/components/chat/prompt-library')
  render(<NextIntlClientProvider locale="en" messages={en}><PromptLibrary onBack={vi.fn()} onSelect={vi.fn()} suggestions={[]} hasProAccess={hasProAccess} hasGoogleConnection={hasGoogleConnection} /></NextIntlClientProvider>)
  expect(screen.queryByRole('button', { name: 'Calendar' })).toBeNull()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Google' } })
  expect(screen.queryByRole('button', { name: 'Import this week' })).toBeNull()
})

it('renders the live composer labels as rows and reuses their activation', async () => {
  const { PromptLibrary } = await import('@/components/chat/prompt-library')
  const onSelect = vi.fn()
  const onBack = vi.fn()
  const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0, profile: createMockProfile() })
  const suggestions = toComposerSuggestions(chips.map(chip => ({ id: chip.id, label: chip.key, onSelect })))
  const { rerender } = render(<NextIntlClientProvider locale="en" messages={en}><PromptLibrary onBack={onBack} onSelect={vi.fn()} suggestions={suggestions} hasProAccess hasGoogleConnection /></NextIntlClientProvider>)
  const live = screen.getByRole('region', { name: 'For you now' })
  await waitFor(() => expect(within(live).getByRole('heading', { name: 'For you now', level: 2 })).toBeVisible())
  expect(within(live).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(suggestions.map(suggestion => suggestion.label))
  expect(within(live).getAllByRole('button').map(button => button.textContent)).toEqual(suggestions.map(suggestion => suggestion.label))
  fireEvent.click(within(live).getAllByRole('button')[0]!)
  expect(onSelect).toHaveBeenCalledOnce()
  expect(onBack).toHaveBeenCalledOnce()
  rerender(<NextIntlClientProvider locale="en" messages={en}><PromptLibrary onBack={onBack} onSelect={vi.fn()} suggestions={[]} hasProAccess hasGoogleConnection /></NextIntlClientProvider>)
  expect(screen.queryByRole('heading', { name: 'For you now' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'For you now' })).toBeNull()
})

it('returns focus to the header when sending removes the empty-thread trigger', async () => {
  const send = vi.fn((content: string) => useChatStore.getState().addMessage({ id: 'sent', role: 'user', content, timestamp: new Date() }))
  conversation(send)
  const headerTrigger = screen.getAllByRole('button', { name: 'Browse ideas' })[0]!
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[1]!)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Plan my morning' }))
  await waitFor(() => expect(headerTrigger).toHaveFocus())
  expect(send).toHaveBeenCalledOnce()
})

it.each(['offline', 'atLimit'] as const)('keeps ideas disabled at %s even while recording masks the composer state', async state => {
  render(<NextIntlClientProvider locale="en" messages={en}><Harness state={state} recording /></NextIntlClientProvider>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  expect(screen.getByRole('button', { name: 'Plan my morning' })).toBeDisabled()
  expect(document.querySelector('[data-prompt-library] [data-capacity-notice]')).not.toBeNull()
})

it('refocuses the library heading when reopened during its exit', async () => {
  conversation()
  const trigger = screen.getAllByRole('button', { name: 'Browse ideas' })[0]!
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Back to conversation' }))
  await waitFor(() => expect(trigger).toHaveFocus(), { interval: 1 })
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
})

it('refocuses a retained heading when the real presence context becomes present again', async () => {
  const { PromptLibrary } = await import('@/components/chat/prompt-library')
  const register = () => () => {}
  const view = (isPresent: boolean) => <NextIntlClientProvider locale="en" messages={en}><PresenceContext value={{ id: 'library', isPresent, register }}><PromptLibrary onBack={vi.fn()} onSelect={vi.fn()} suggestions={[]} hasProAccess hasGoogleConnection /></PresenceContext></NextIntlClientProvider>
  const { rerender } = render(view(true))
  expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus()
  rerender(view(false))
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.focus()
  rerender(view(true))
  expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus()
  outside.remove()
})

it('keeps heading focus when reopening before a deferred idea restores its trigger', async () => {
  useChatStore.getState().setDraft('Keep this draft')
  conversation()
  const trigger = screen.getAllByRole('button', { name: 'Browse ideas' })[0]!
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }))
  fireEvent.click(screen.getByRole('button', { name: 'Set a reminder' }))
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus())
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus()
})

it.each(['en', 'pt-BR'] as const)('renders every approved intent and useful example with exact selection bytes in %s', locale => {
  const messages = locale === 'en' ? en : ptBR
  const t = createTranslator({ locale, messages })
  const onSelect = vi.fn()
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>{PROMPT_TEMPLATES.map(template => <CatalogIdea key={template.id} template={template} disabled={false} onSelect={onSelect} />)}</NextIntlClientProvider>)
  expect(container.querySelectorAll('[data-prompt-idea]')).toHaveLength(36)
  expect(container.querySelectorAll('[data-prompt-example]')).toHaveLength(12)
  for (const template of PROMPT_TEMPLATES) {
    const label = t(template.labelKey)
    const prompt = t(template.promptKey)
    const action = screen.getByRole('button', { name: label })
    expect(action.querySelectorAll('button')).toHaveLength(0)
    const icon = action.querySelector('[data-prompt-intent] svg')!
    expect(icon).toHaveAttribute('width', '24')
    expect(icon).toHaveAttribute('stroke-width', '1.5')
    expect(action.querySelector('[data-prompt-example]')?.textContent).toBe(PROMPT_PRESENTATION[template.id].example ? prompt : undefined)
    expect(action.querySelector('[data-prompt-attribution]')).toBeNull()
    fireEvent.click(action)
    expect(onSelect).toHaveBeenLastCalledWith(template.id, label, prompt)
  }
  expect(onSelect).toHaveBeenCalledTimes(36)
  expect(container.textContent).not.toContain("'{'")
})

it('keeps live supplied icons, hides live actions during search and restores the selected category without requests', async () => {
  const onSelect = vi.fn()
  const liveSelect = vi.fn()
  const suggestions = toComposerSuggestions([{ id: 'supplied', label: 'Supplied suggestion', icon: <svg data-supplied-icon="" />, onSelect: liveSelect }, { id: 'missing', label: 'Suggestion without icon', onSelect: liveSelect }])
  const { container } = render(<NextIntlClientProvider locale="en" messages={en}><PromptLibrary onBack={vi.fn()} onSelect={onSelect} suggestions={suggestions} hasProAccess hasGoogleConnection /></NextIntlClientProvider>)
  const live = screen.getByRole('region', { name: 'For you now' })
  expect(live.querySelector('[data-supplied-icon]')).not.toBeNull()
  expect(live.querySelectorAll('[data-prompt-intent] svg')).toHaveLength(1)
  expect(screen.queryByRole('heading', { name: 'Start' })).toBeNull()
  for (const category of PROMPT_CATEGORIES) fireEvent.click(screen.getByRole('button', { name: en.chat.templates.categories[category] }))
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'week' } })
  expect(screen.queryByRole('region', { name: 'For you now' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'For you now' })).toBeNull()
  expect(container.querySelectorAll('[data-prompt-idea="catalog"]').length).toBeGreaterThan(0)
  expect(screen.getAllByRole('heading').length).toBeGreaterThan(1)
  fireEvent.change(search, { target: { value: '   ' } })
  await waitFor(() => expect(screen.getByRole('region', { name: 'For you now' })).toBeVisible())
  expect(within(screen.getByRole('region', { name: 'For you now' })).getByRole('heading', { name: 'For you now', level: 2 })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Calendar' })).toBeVisible()
  expect(onSelect).not.toHaveBeenCalled()
  expect(liveSelect).not.toHaveBeenCalled()
})

it('uses the shared search field and keeps live rows free of repeated decoration', () => {
  const suggestions = toComposerSuggestions([{ id: 'live', label: 'Live suggestion', onSelect: vi.fn() }, { id: 'another', label: 'Another suggestion', onSelect: vi.fn() }])
  const { container } = render(<NextIntlClientProvider locale="en" messages={en}><PromptLibrary onBack={vi.fn()} onSelect={vi.fn()} suggestions={suggestions} hasProAccess hasGoogleConnection /></NextIntlClientProvider>)
  const search = screen.getByRole('searchbox', { name: 'Search ideas' })
  expect(search).toHaveAttribute('placeholder', 'Search ideas')
  expect(search.closest('[data-input-root]')).not.toBeNull()
  expect(container.querySelector('[data-prompt-attribution]')).toBeNull()
  expect(screen.getByRole('button', { name: 'Live suggestion' }).querySelector('svg')).toBeNull()
})

it('ignores repeated activations and stale exiting actions, then rearms on reopen', () => {
  const select = vi.fn()
  const register = () => () => {}
  const view = (isPresent: boolean) => <NextIntlClientProvider locale="en" messages={en}><PresenceContext value={{ id: 'library', isPresent, register }}><PromptLibrary onBack={vi.fn()} onSelect={select} suggestions={[]} hasProAccess hasGoogleConnection /></PresenceContext></NextIntlClientProvider>
  const { rerender } = render(view(true))
  const action = screen.getByRole('button', { name: 'Plan my morning' })
  fireEvent.click(action)
  fireEvent.click(action)
  expect(select).toHaveBeenCalledTimes(1)
  rerender(view(false))
  fireEvent.click(action)
  expect(select).toHaveBeenCalledTimes(1)
  rerender(view(true))
  fireEvent.click(action)
  expect(select).toHaveBeenCalledTimes(2)
})
