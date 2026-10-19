import { createRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AstraConversation } from '@/components/chat/conversation'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/chat/message-bubble', () => ({
  MessageBubble: ({ message }: { message: { content: string } }) => <p>{message.content}</p>,
}))

const importAttempt = vi.fn()

beforeEach(() => {
  importAttempt.mockReset()
  vi.doMock('@/components/chat/prompt-library', () => {
    importAttempt()
    throw new Error('Library chunk connection interrupted')
  })
  useUIStore.getState().setAstraConversationOpen(true)
})

afterEach(() => {
  cleanup()
  vi.doUnmock('@/components/chat/prompt-library')
  useUIStore.getState().setAstraConversationOpen(false)
})

function conversation(locale: 'en' | 'pt-BR' = 'en') {
  const chat = {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [{ id: 'retained-turn', role: 'user', content: 'Keep this conversation', timestamp: new Date() }],
    activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: false,
    canShowFollowUps: false, isOnline: true, hasProAccess: true, hasGoogleConnection: true, sendMessage: vi.fn(),
    composerProps: {
      state: 'idle', value: 'My unfinished draft', onChangeValue: vi.fn(), onSend: vi.fn(), suggestions: [],
      words: { placeholder: 'Ask Astra', send: 'Send', inputLabel: 'Message', actions: 'Attach', suggestionsLabel: 'Suggestions' },
    },
  } as unknown as Parameters<typeof AstraConversation>[0]['chat']
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><AstraConversation chat={chat} /></NextIntlClientProvider>)
}

it('contains a rejected import inside the library and keeps the thread, Back and close usable', async () => {
  conversation()
  const thread = screen.getByRole('feed', { name: 'Astra' })
  const composer = screen.getByRole('textbox', { name: 'Message' })
  const trigger = screen.getByRole('button', { name: 'Browse ideas' })
  fireEvent.click(trigger)
  await waitFor(() => expect(importAttempt).toHaveBeenCalledOnce())
  const failure = await screen.findByRole('alert')
  const library = failure.closest('[data-prompt-library]')!
  expect(library).not.toBeNull()
  expect(within(library as HTMLElement).getByRole('heading', { name: 'Ideas' })).toHaveFocus()
  expect(failure).toHaveTextContent(en.common.error)
  expect(within(failure).getByRole('button', { name: en.common.retry })).toBeEnabled()
  expect(thread).toBeInTheDocument()
  expect(thread).toHaveTextContent('Keep this conversation')
  expect(composer).toHaveValue('My unfinished draft')
  fireEvent.click(within(library as HTMLElement).getByRole('button', { name: 'Back to conversation' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole('feed', { name: 'Astra' })).toBe(thread)
  expect(screen.getByRole('textbox', { name: 'Message' })).toBe(composer)
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Close conversation' }))
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it('imports again after reconnecting and renders the library on the second open', async () => {
  conversation()
  const thread = screen.getByRole('feed', { name: 'Astra' })
  const trigger = screen.getByRole('button', { name: 'Browse ideas' })
  fireEvent.click(trigger)
  await waitFor(() => expect(importAttempt).toHaveBeenCalledOnce())
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
  let finishImport!: () => void
  const pendingImport = new Promise<void>(resolve => { finishImport = resolve })
  vi.doMock('@/components/chat/prompt-library', async () => {
    importAttempt()
    await pendingImport
    return vi.importActual('@/components/chat/prompt-library')
  })
  fireEvent.click(trigger)
  await waitFor(() => expect(importAttempt).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: 'Back to conversation' })).toBeEnabled()
  expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus()
  await act(async () => { finishImport() })
  expect(await screen.findByRole('button', { name: 'Plan my morning' })).toBeEnabled()
  expect(screen.getByRole('heading', { name: 'Ideas' })).toHaveFocus()
  expect(importAttempt).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(thread).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back to conversation' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole('feed', { name: 'Astra' })).toBe(thread)
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('My unfinished draft')
})

it.each(['en', 'pt-BR'] as const)('keeps Back available through a retry and loads the ideas in %s', async locale => {
  const messages = locale === 'en' ? en : ptBR
  conversation(locale)
  fireEvent.click(screen.getByRole('button', { name: messages.chat.templates.browse }))
  const failure = await screen.findByRole('alert')
  expect(failure).toHaveTextContent(messages.common.error)
  const heading = screen.getByRole('heading', { name: messages.chat.templates.title })
  let finishImport!: () => void
  const pendingImport = new Promise<void>(resolve => { finishImport = resolve })
  vi.doMock('@/components/chat/prompt-library', async () => {
    importAttempt()
    await pendingImport
    return vi.importActual('@/components/chat/prompt-library')
  })
  fireEvent.click(within(failure).getByRole('button', { name: messages.common.retry }))
  await waitFor(() => expect(importAttempt).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: messages.chat.templates.back })).toBeEnabled()
  expect(screen.getByRole('heading', { name: messages.chat.templates.title })).toBe(heading)
  await act(async () => { finishImport() })
  expect(await screen.findByRole('searchbox', { name: messages.chat.templates.search })).toBeEnabled()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('heading', { name: messages.chat.templates.title })).toHaveFocus()
})
