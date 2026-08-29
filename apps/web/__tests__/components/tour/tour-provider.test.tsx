import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useEffect, useMemo } from 'react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import type { Profile } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { useUIStore } from '@/stores/ui-store'
import {
  ShellScrollerProvider,
  useShellScroller,
  useShellScrollerRegistration,
} from '@/components/shell/shell-scroller-context'
import { FlowShell } from '@/components/shell/flow-shell'

const mockChatComposer = vi.hoisted(() => ({
  chatContainerRef: { current: null as HTMLDivElement | null },
  messages: [],
  isTyping: false,
  isSending: false,
  streamingMessageId: null,
  hasProAccess: true,
  atMessageLimit: false,
  showSuggestions: false,
  sendMessage: vi.fn(),
  handleBreakdownConfirmed: vi.fn(),
  confirmAndExecutePendingOperation: vi.fn(),
  prepareStepUpForBubble: vi.fn(),
  verifyStepUpForBubble: vi.fn(),
  isOnline: true,
  sendError: null,
  fileInputRef: { current: null as HTMLInputElement | null },
  handleFileSelect: vi.fn(),
  composerProps: {
    state: 'idle',
    words: {
      placeholder: 'Ask Astra',
      send: 'Send',
      suggestionsLabel: 'Suggestions',
    },
    value: '',
    onChangeValue: vi.fn(),
    onSend: vi.fn(),
    suggestions: [
      { id: 'one', label: 'One', onSelect: vi.fn() },
      { id: 'two', label: 'Two', onSelect: vi.fn() },
      { id: 'three', label: 'Three', onSelect: vi.fn() },
    ],
  } satisfies ComposerProps,
}))

const mockRouterPush = vi.fn()
let mockPathname = '/'
let mockProfile: Profile | undefined
const mockInject = vi.fn()
const mockRestore = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname,
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => mockChatComposer,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabitDetail: () => ({ data: undefined }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/app/(chat)/chat/chat-composer-bar', () => ({ ChatComposerBar: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/habits/habit-detail-drawer', () => ({ HabitDetailDrawer: () => null }))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/hooks/use-tour-mock-data', () => ({
  useTourMockData: () => ({ inject: mockInject, restore: mockRestore }),
}))

import { TourProvider } from '@/components/tour/tour-provider'
import ChatPage from '@/app/(chat)/chat/page'

let observedShellScroller: HTMLElement | null = null

function TourHarness() {
  const owner = useMemo(() => Symbol('tour-shell'), [])
  const registerScroller = useShellScrollerRegistration(owner)
  return (
    <div ref={registerScroller} data-testid="tour-shell-scroller">
      <TourProvider />
    </div>
  )
}

function ConversationScroller() {
  const owner = useMemo(() => Symbol('tour-conversation'), [])
  const registerScroller = useShellScrollerRegistration(owner)
  return <div ref={registerScroller} role="log" aria-label="Conversation" />
}

function TourConversationHarness({ conversationOpen }: Readonly<{ conversationOpen: boolean }>) {
  const owner = useMemo(() => Symbol('tour-page'), [])
  const registerScroller = useShellScrollerRegistration(owner)
  return (
    <>
      <div ref={registerScroller} data-testid="tour-page-scroller" />
      {conversationOpen ? <ConversationScroller /> : null}
      <TourProvider />
    </>
  )
}

function renderTourProvider() {
  return render(
    <ShellScrollerProvider>
      <TourHarness />
    </ShellScrollerProvider>,
  )
}

function renderChatTourProvider() {
  return render(
    <FlowShell mode="full">
      <ChatTourHarness />
    </FlowShell>,
  )
}

function ChatTourHarness() {
  return (
    <>
      <ChatPage />
      <ShellScrollerProbe />
      <TourProvider />
    </>
  )
}

function ShellScrollerProbe() {
  const shellScroller = useShellScroller()
  useEffect(() => {
    observedShellScroller = shellScroller
  }, [shellScroller])
  return null
}

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('TourProvider step routing', () => {
  beforeEach(() => {
    useTourStore.getState().endTour()
    useTourStore.getState().setHiddenSections([])
    mockRouterPush.mockClear()
    mockPathname = '/'
    mockProfile = createMockProfile({ hasProAccess: true })
  })

  it.each([
    ['desktop', true],
    ['phone', false],
  ])('routes the profile section to /profile at the %s breakpoint', (_name, matches) => {
    stubMatchMedia(matches)
    renderTourProvider()

    act(() => {
      useTourStore.getState().startSectionReplay('profile')
    })

    expect(useTourStore.getState().getCurrentStep()?.id).toBe('profile-streak')
    expect(mockRouterPush).toHaveBeenCalledWith('/profile')
  })
})

describe('TourProvider session lifecycle', () => {
  beforeEach(() => {
    useTourStore.getState().endTour()
    useTourStore.getState().setHiddenSections([])
    mockRouterPush.mockClear()
    mockInject.mockClear()
    mockRestore.mockClear()
    mockPathname = '/'
    mockProfile = createMockProfile({ hasProAccess: true })
    useUIStore.setState({ searchQuery: '' })
    observedShellScroller = null
    mockChatComposer.chatContainerRef.current = null
    stubMatchMedia(false)
  })

  it('injects tour mock data on activation and restores it when the tour ends', () => {
    renderTourProvider()

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    expect(mockInject).toHaveBeenCalledTimes(1)

    act(() => {
      useTourStore.getState().endTour()
    })
    expect(mockRestore).toHaveBeenCalledTimes(1)
  })

  it('restores an active search after the tour ends', () => {
    useUIStore.setState({ searchQuery: 'focus' })
    renderTourProvider()

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    expect(useUIStore.getState().searchQuery).toBe('')

    act(() => {
      useTourStore.getState().endTour()
    })
    expect(useUIStore.getState().searchQuery).toBe('focus')
  })

  it('remeasures the spotlight target on scroll while the tour is active', async () => {
    renderTourProvider()

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    const step = useTourStore.getState().getCurrentStep()
    expect(step).toBeTruthy()

    const target = document.createElement('div')
    target.setAttribute('data-tour', step!.targetId)
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    act(() => {
      useTourStore.getState().setTargetRect(null)
    })

    await act(async () => {
      screen.getByTestId('tour-shell-scroller').dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(useTourStore.getState().targetRect).not.toBeNull()
    target.remove()
  })

  it('remeasures chat targets only from the registered message pane', async () => {
    mockPathname = '/chat'
    renderChatTourProvider()

    const chatMessagePane = screen.getByRole('log', { name: 'chat.title' })
    expect(chatMessagePane).toHaveAttribute('data-tour', 'tour-chat-area')
    expect(observedShellScroller).toBe(chatMessagePane)
    chatMessagePane.scrollIntoView = vi.fn()

    act(() => {
      useTourStore.getState().startSectionReplay('chat')
    })
    const step = useTourStore.getState().getCurrentStep()
    expect(step?.id).toBe('chat-area')

    act(() => {
      useTourStore.getState().setTargetRect(null)
    })

    await act(async () => {
      document.querySelector<HTMLElement>('[data-flow-mode="full"]')?.dispatchEvent(
        new Event('scroll'),
      )
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(useTourStore.getState().targetRect).toBeNull()

    await act(async () => {
      chatMessagePane.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(useTourStore.getState().targetRect).not.toBeNull()
  })

  it('remeasures from the page after a conversation opens and closes', async () => {
    const view = render(
      <ShellScrollerProvider>
        <TourConversationHarness conversationOpen={false} />
      </ShellScrollerProvider>,
    )

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    const step = useTourStore.getState().getCurrentStep()
    expect(step).toBeTruthy()

    const target = document.createElement('div')
    target.setAttribute('data-tour', step!.targetId)
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    view.rerender(
      <ShellScrollerProvider>
        <TourConversationHarness conversationOpen />
      </ShellScrollerProvider>,
    )
    view.rerender(
      <ShellScrollerProvider>
        <TourConversationHarness conversationOpen={false} />
      </ShellScrollerProvider>,
    )

    act(() => {
      useTourStore.getState().setTargetRect(null)
    })
    await act(async () => {
      screen.getByTestId('tour-page-scroller').dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(useTourStore.getState().targetRect).not.toBeNull()
    target.remove()
  })
})
