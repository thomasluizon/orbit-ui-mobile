import { createChatThreadScroll } from '@orbit/shared/hooks'
import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AstraConversation } from '@/components/chat/conversation'
import { DestinationShell } from '@/components/shell/destination-shell'
import { useUIStore } from '@/stores/ui-store'
import { useShellStore } from '@/stores/shell-store'

const navigation = vi.hoisted(() => ({ pathname: '/', push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useParams: () => ({}),
  useRouter: () => ({ push: navigation.push }),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Person', email: 'person@example.com' } }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({
  CommandPalette: () => useShellStore((state) => state.paletteOpen) ? <div role="dialog" aria-label="Search palette" /> : null,
}))

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
const words = { placeholder: 'Message', send: 'Send', actions: 'Attachments', suggestionsLabel: 'Suggestions' }
const attachWords = { image: 'Photo', file: 'Document', trayLabel: 'Attachments', remove: (name: string) => name }
const voiceWords = { start: 'Voice', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' }

function buildChat(draft: string): ChatController {
  return {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(), messages: [], activeSteps: [],
    canShowFollowUps: false, isTyping: false, streamingMessageId: null, showSuggestions: true,
    sendMessage: vi.fn(), handleBreakdownConfirmed: vi.fn(), confirmAndExecutePendingOperation: vi.fn(),
    prepareStepUpForBubble: vi.fn(), verifyStepUpForBubble: vi.fn(), isOnline: true,
    sendError: null, canRetryLastSend: false, retryLastSend: vi.fn(),
    composerProps: { state: 'idle', words, value: draft, onChangeValue: vi.fn(), onSend: vi.fn(), suggestions: [],
      attachWords, voiceWords, onAttachImage: vi.fn(), onAttachFile: vi.fn(), onVoice: vi.fn() },
  } as unknown as ChatController
}

function App({ draft = '' }: Readonly<{ draft?: string }>) {
  const open = useUIStore((state) => state.astraConversationOpen)
  return <DestinationShell conversation={<AstraConversation chat={buildChat(draft)} />} conversationOpen={open}
    conversationLabel="Astra" onCreate={() => navigation.push('/habits/new')}>
    <h1>{navigation.pathname}</h1>
  </DestinationShell>
}

beforeEach(() => {
  navigation.pathname = '/'
  navigation.push.mockReset().mockImplementation((pathname: string) => { navigation.pathname = pathname })
  useUIStore.setState({ astraConversationOpen: false })
  useShellStore.setState({ paletteOpen: false })
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: /min-width/.test(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})
afterEach(() => vi.unstubAllGlobals())

it('keeps focus in each anchored attachment action and lets Escape close the menu before Astra', async () => {
  render(<App />)
  const row = screen.getByRole('button', { name: 'chat.title' })
  fireEvent.click(row)
  expect(screen.getByRole('textbox', { name: words.placeholder })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: words.actions }))
  const menu = await screen.findByRole('menu', { name: words.actions })
  expect(document.querySelector('[data-shell]')).not.toContainElement(menu)
  for (const label of [attachWords.image, attachWords.file, voiceWords.start]) {
    const item = within(menu).getByRole('menuitem', { name: label })
    act(() => item.focus())
    expect(item).toHaveFocus()
  }
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  expect(screen.getByRole('button', { name: words.actions })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Astra' })).toBeNull()
  expect(row).toHaveFocus()
})

it('redirects focus from an unrelated portal back to the conversation', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.title' }))
  const unrelated = document.createElement('button')
  unrelated.textContent = 'Unrelated portal'
  document.body.append(unrelated)
  try {
    act(() => unrelated.focus())
    expect(screen.getByRole('textbox', { name: words.placeholder })).toHaveFocus()
  } finally { unrelated.remove() }
})

it.each([false, true])('hands attachment-menu focus back to the composer on Tab with shift=%s', async (shiftKey) => {
  render(<App draft="Keep this draft" />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.title' }))
  fireEvent.click(screen.getByRole('button', { name: words.actions }))
  const menu = await screen.findByRole('menu', { name: words.actions })
  act(() => within(menu).getByRole('menuitem', { name: attachWords.image }).focus())
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  expect(shiftKey ? screen.getByRole('textbox', { name: words.placeholder }) : screen.getByRole('button', { name: words.send })).toHaveFocus()
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
  expect(screen.getByRole('textbox', { name: words.placeholder })).toHaveValue('Keep this draft')
})

it.each([
  ['notifications.bell', '/notifications'], ['Person, person@example.com', '/profile'],
  ['nav.createHabit', '/habits/new'], ['nav.today', '/'], ['nav.calendar', '/calendar'],
  ['nav.progress', '/progress'], ['nav.profile', '/profile'],
])('closes Astra before sidebar navigation through %s', (label, pathname) => {
  const view = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.title' }))
  const control = label === 'Person, person@example.com'
    ? screen.getByRole('link', { name: label }) : screen.getByRole('button', { name: label })
  fireEvent.click(control)
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  expect(screen.queryByRole('dialog', { name: 'Astra' })).toBeNull()
  if (control.tagName === 'A') {
    expect(control).toHaveAttribute('href', pathname)
    navigation.pathname = pathname
  } else if (pathname !== '/') expect(navigation.push).toHaveBeenCalledWith(pathname)
  view.rerender(<App />)
  expect(screen.getByRole('heading', { name: pathname })).toBeVisible()
})

it('closes Astra before opening sidebar search', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.title' }))
  fireEvent.click(screen.getByRole('button', { name: /^nav.search/ }))
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  expect(screen.queryByRole('dialog', { name: 'Astra' })).toBeNull()
  expect(screen.getByRole('dialog', { name: 'Search palette' })).toBeVisible()
})
