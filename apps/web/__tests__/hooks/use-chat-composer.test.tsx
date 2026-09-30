import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '@orbit/shared/chat'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { buildComposerChips } from '@orbit/shared/chat'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { goalKeys, habitKeys, profileKeys, tagKeys } from '@orbit/shared/query'
import type { ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitDetail, HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mocks = vi.hoisted(() => ({
  pathname: '/support',
  searchParams: '',
  state: {
    profile: undefined as Profile | undefined,
    habitData: { topLevelHabits: [] as NormalizedHabit[], totalCount: 0 } as { topLevelHabits: NormalizedHabit[]; totalCount: number } | null,
    detail: null as HabitDetail | null,
    habitFilters: [] as HabitsFilter[],
    isRecording: false,
    isTranscribing: false,
    speechSupported: true,
    transcript: '',
    speechError: null as string | null,
  },
  fetch: vi.fn(),
  routerPush: vi.fn(),
  toggleRecording: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush, prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.searchParams),
}))

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: React.ReactNode }) => children, useToday: () => '2026-09-12' }))
vi.mock('@/components/shell/destination-shell', () => ({
  DestinationShell: ({ composer }: { composer: React.ReactNode }) => <main>{composer}</main>,
}))
vi.mock('@/components/command/command-palette', () => ({ CommandPaletteBackground: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: vi.fn() }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: vi.fn() }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/hooks/use-habits', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habits')>(),
  useTotalHabitCount: () => 0,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ crossedStreakMilestones: [], newAchievements: [] }),
  useReportEvent: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftHydrated: () => true,
  useOnboardingHasPendingAnswers: () => false,
  useOnboardingDraftStore: Object.assign(
    (selector: (state: { pushRegistrationFailed: boolean }) => unknown) => selector({ pushRegistrationFailed: false }),
    {
      getState: () => ({ reset: vi.fn(), setAccountScope: vi.fn() }),
      persist: { rehydrate: vi.fn() },
    },
  ),
}))
vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/ui/trial-expired-modal', () => ({ TrialExpiredModal: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/onboarding/retained-onboarding-overlay', () => ({ RetainedOnboardingOverlay: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
  useQuery: () => ({ data: undefined, error: null, isLoading: false, isError: false }),
  useMutation: (options: { mutationFn?: (value: unknown) => unknown }) => ({
    mutate: (value: unknown) => options.mutationFn?.(value),
    isPending: false,
  }),
}))

vi.mock('@orbit/shared/query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/query')>(),
  resetAccountQueries: vi.fn(async () => {}),
}))

vi.mock('@/lib/query-client', () => ({
  getQueryClient: () => mocks.queryClient,
}))

vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabits: (filters: HabitsFilter) => { mocks.state.habitFilters.push(filters); return { data: mocks.state.habitData, isError: false } },
  useHabitDetail: () => ({ data: mocks.state.detail, isError: false }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.state.profile }),
}))

vi.mock('@/hooks/use-speech-to-text', () => ({
  useSpeechToText: () => ({
    isRecording: mocks.state.isRecording,
    isTranscribing: mocks.state.isTranscribing,
    isSupported: mocks.state.speechSupported,
    transcript: mocks.state.transcript,
    error: mocks.state.speechError,
    toggleRecording: mocks.toggleRecording,
    recordingDuration: 0,
  }),
}))

vi.mock('@/app/actions/chat', () => ({
  confirmPendingOperation: vi.fn(),
  executePendingOperation: vi.fn(),
  issuePendingOperationStepUp: vi.fn(),
  verifyPendingOperationStepUp: vi.fn(),
}))

import { useChatComposer } from '@/hooks/use-chat-composer'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { useThrottleStore } from '@/stores/throttle-store'
import { getErrorSurface } from '@orbit/shared/utils'
import { Composer } from '@/components/shell/composer'
import AppLayout from '@/app/(app)/layout'
import { ShellWide } from '@/components/shell/shell-wide'
import { AstraConversation } from '@/components/chat/conversation'
import { setApiFetchTranslate, translateApiFetchMessage } from '@/lib/api-fetch'
import { confirmPendingOperation, executePendingOperation } from '@/app/actions/chat'

function makeChatResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    aiMessage: 'Hi there',
    actions: [],
    ...overrides,
  }
}

const frame = (json: string) => `data: ${json}\n\n`

function signInAs(userId: string) {
  useAuthStore.getState().setAuth({ userId, name: 'Alex', email: 'alex@example.com' })
}

function answerSessionWith(session: { expiresAt: number; userId: string }) {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ...session, refreshFailed: false }),
  })
}

function refuseSessionRefresh() {
  mocks.fetch.mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ refreshFailed: true }),
  })
}

function sseResponse(...frames: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const sseFrame of frames) {
        controller.enqueue(encoder.encode(sseFrame))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function finalFrame(response: ChatResponse): string {
  return frame(JSON.stringify({ type: 'final', response }))
}

function controlledSseResponse() {
  const encoder = new TextEncoder()
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
  })
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    enqueue: (sseFrame: string) => streamController.enqueue(encoder.encode(sseFrame)),
    close: () => streamController.close(),
  }
}

function fileChangeEvent(file?: File) {
  const input = document.createElement('input')
  Object.defineProperty(input, 'files', { value: file ? [file] : [] })
  return { target: input } as Parameters<
    ReturnType<typeof useChatComposer>['handleTextFileSelect']
  >[0]
}

function textFile(name: string, content: string, size = content.length) {
  const file = new File([new Uint8Array(size)], name)
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: vi.fn().mockResolvedValue(content),
  })
  return file
}

function ComposerConversationHarness({ conversationReady = true }: { conversationReady?: boolean }) {
  const chat = useChatComposer({ pathname: '/profile' })
  const open = useUIStore((state) => state.astraConversationOpen)
  return <ShellWide
    items={[]}
    activeId="perfil"
    navLabel="Navigation"
    composer={<Composer {...chat.composerProps} onOpenConversation={() => useUIStore.getState().setAstraConversationOpen(true)} conversationLabel="Open Astra" />}
    conversation={conversationReady ? <AstraConversation chat={chat} /> : null}
    conversationOpen={open}
    conversationLabel="Astra"
  ><p>Profile</p></ShellWide>
}

describe('web useChatComposer streaming send', () => {
  it.each([412, 1440])('opens the conversation for a shell typed send at %s with streaming text and one composer', async (width) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    render(<ComposerConversationHarness />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Plan my morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))
    expect(screen.getByText('Plan my morning')).toBeVisible()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('textbox').closest('[data-composer-root]')).toHaveFocus()
    await act(async () => { stream.enqueue(frame('{"type":"delta","text":"Start with water"}')) })
    expect(screen.getByText('Start with water')).toBeVisible()
    await act(async () => { stream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Start with water' }))); stream.close() })
    fireEvent.click(screen.getByRole('button', { name: 'common.closeConversation' }))
    expect(screen.getByRole('button', { name: 'Open Astra' })).toHaveFocus()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })

  it.each([412, 1440])('preserves close button focus when a streamed send finishes at %s', async (width) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    render(<ComposerConversationHarness />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Plan my morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))
    const closeButton = screen.getByRole('button', { name: 'common.closeConversation' })
    act(() => closeButton.focus())
    expect(closeButton).toHaveFocus()
    await act(async () => { stream.enqueue(finalFrame(makeChatResponse())); stream.close() })
    expect(screen.getByText('Hi there')).toBeVisible()
    expect(closeButton).toHaveFocus()
  })

  it.each([412, 1440])('focuses the composer when the lazy conversation mounts during a send at %s', async (width) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const view = render(<ComposerConversationHarness conversationReady={false} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Plan my morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))
    view.rerender(<ComposerConversationHarness />)
    expect(screen.getByRole('textbox').closest('[data-composer-root]')).toHaveFocus()
    await act(async () => { stream.enqueue(finalFrame(makeChatResponse())); stream.close() })
  })

  it.each([412, 1440])('opens on shell field focus at %s and carries every draft edit', (width) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    useChatStore.setState({ draft: 'Already typed', draftHydrated: true })
    render(<ComposerConversationHarness />)
    act(() => screen.getByRole('textbox').focus())
    expect(screen.getByRole('button', { name: 'common.closeConversation' })).toBeVisible()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(screen.getByRole('textbox')).toHaveValue('Already typed')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Already typed and continued' } })
    expect(useChatStore.getState().draft).toBe('Already typed and continued')
  })

  it('keeps chip sends in the conversation with focus in its only composer', async () => {
    mocks.state.profile = createMockProfile()
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    render(<ComposerConversationHarness />)
    const group = screen.getByRole('group', { name: 'shell.composer.suggestionsLabel' })
    fireEvent.click(group.querySelector('button')!)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('textbox').closest('[data-composer-root]')).toHaveFocus()
    await waitFor(() => expect(screen.getByText('Hi there')).toBeVisible())
  })

  it('opens the conversation when sending a finished voice transcript', async () => {
    mocks.state.isRecording = true
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result, rerender } = renderHook(() => useChatComposer())
    mocks.state.isRecording = false
    mocks.state.transcript = 'Voice request'
    rerender()
    await act(async () => { result.current.composerProps.onSend(); await Promise.resolve() })
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().messages[0]?.content).toBe('Voice request')
  })

  it('sends the profile clock preference to Astra', async () => {
    mocks.state.profile = createMockProfile({ uses24HourClock: true })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.sendMessage('Hello') })
    const formData = mocks.fetch.mock.calls[0]?.[1]?.body as FormData
    const context = JSON.parse(formData.get('clientContext') as string)
    expect(context.timeFormat).toBe('24h')
  })

  it('keeps tool steps and follow-ups on the final answer and marks a chip send', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"step","domain":"habits","access":"read"}'),
      frame('{"type":"step","domain":"goals","access":"write"}'),
      finalFrame(makeChatResponse({ followUps: ['Check goals', 'Review habits'] })),
    ))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.handleTextFileSelect(fileChangeEvent(textFile('notes.txt', 'Keep this file'))) })
    act(() => result.current.setInput('Keep this draft'))
    await act(async () => { await result.current.sendMessage('Check goals', 'followUp') })
    const answer = useChatStore.getState().messages.at(-1)
    expect(answer?.toolSteps).toEqual([
      { domain: 'habits', access: 'read' }, { domain: 'goals', access: 'write' },
    ])
    expect(answer?.followUps).toEqual(['Check goals', 'Review habits'])
    const formData = mocks.fetch.mock.calls[0]?.[1]?.body as FormData
    expect(formData.get('message')).toBe('Check goals')
    expect(formData.get('image')).toBeNull()
    expect(result.current.input).toBe('Keep this draft')
    expect(result.current.selectedTextFile?.name).toBe('notes.txt')
    const context = JSON.parse(formData.get('clientContext') as string)
    expect(context).toMatchObject({ messageOrigin: 'followUp', supportsHabitListDoneStatus: true, supportsPendingOperationChanges: true, supportsToolSteps: true, supportsFollowUps: true })
  })

  beforeEach(() => {
    HTMLElement.prototype.scrollTo = vi.fn()
    useThrottleStore.getState().clear()
    mocks.state.profile = undefined
    mocks.searchParams = ''
    mocks.state.habitData = { topLevelHabits: [], totalCount: 0 }
    mocks.state.detail = null
    mocks.state.habitFilters = []
    mocks.state.isRecording = false
    mocks.state.isTranscribing = false
    mocks.state.speechSupported = true
    mocks.state.transcript = ''
    mocks.state.speechError = null
    mocks.fetch.mockReset()
    mocks.routerPush.mockReset()
    mocks.toggleRecording.mockReset()
    mocks.queryClient.invalidateQueries.mockReset()
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
    mocks.queryClient.setQueryData.mockClear()
    useChatStore.setState({ messages: [], isTyping: false, streamingMessageId: null, draft: '', draftHydrated: false, contextualSuggestion: null })
    useUIStore.getState().setAstraConversationOpen(false)
    useUIStore.getState().setCalendarHasError(false)
    globalThis.localStorage.clear()
    vi.stubGlobal('fetch', mocks.fetch)
  })

  afterEach(() => {
    useThrottleStore.getState().clear()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('sends the account held when chat intent formed', async () => {
    signInAs('account-a')
    mocks.fetch.mockResolvedValue(new Response('{"error":"failed"}', { status: 500 }))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => { await result.current.sendMessage('hello') })

    expect(mocks.fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-Orbit-Held-Account-Id': 'account-a',
    })
  })

  it('finishes a held write without appending another message', async () => {
    vi.mocked(confirmPendingOperation).mockResolvedValueOnce({ ok: true, data: { pendingOperationId: 'pending-1', confirmationToken: 'token-1', expiresAtUtc: '2026-09-29T12:00:00Z' } })
    vi.mocked(executePendingOperation).mockResolvedValueOnce({ ok: true, data: { operation: {
      operationId: 'operation-1', sourceName: 'CreateHabit', riskClass: 'Low', confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created',
    } } })
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.confirmAndExecutePendingOperation('pending-1') })
    expect(useChatStore.getState().messages).toHaveLength(0)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled()
  })

  it('shows reload guidance and disables retry after an account switch refusal', async () => {
    signInAs('account-a')
    mocks.fetch.mockResolvedValue(Response.json({
      error: 'Account changed', errorCode: 'ACCOUNT_CHANGED',
    }, { status: 409 }))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => { await result.current.sendMessage('hello') })

    expect(result.current.sendError).toBe('errors.api.accountChanged')
    expect(result.current.canRetryLastSend).toBe(false)
  })

  it('sends Support entry intent on the first and later requests of that conversation', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    useUIStore.getState().setAstraConversationOpen(true, 'support')

    await act(async () => { await result.current.sendMessage('my streak reset') })
    await act(async () => { await result.current.sendMessage('can you help?') })

    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    for (const [, request] of mocks.fetch.mock.calls) {
      const context = JSON.parse((request.body as FormData).get('clientContext') as string)
      expect(context.entryPointIntent).toBe('support')
    }
  })

  it.each([
    ['/profile', 'open', undefined],
    ['/profile', 'direct-send', undefined],
  ])('captures route intent through the layout %s %s callback before the first request', async (pathname, action, expectedIntent) => {
    mocks.pathname = pathname
    useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
    mocks.fetch.mockImplementation((path: string) => Promise.resolve(path === '/api/auth/session'
      ? new Response(JSON.stringify({ expiresAt: Date.now() + 3_600_000, userId: 'test-user', refreshFailed: false }))
      : sseResponse(finalFrame(makeChatResponse()))))
    render(<AppLayout><p>Support</p></AppLayout>)

    if (action === 'open') fireEvent.click(screen.getByRole('button', { name: 'todayAstra.openConversation' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my streak reset' } })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))

    await waitFor(() => expect(mocks.fetch.mock.calls.some(([, request]) => request?.body instanceof FormData)).toBe(true))
    const [, request] = mocks.fetch.mock.calls.find(([, options]) => options?.body instanceof FormData)!
    const context = JSON.parse((request.body as FormData).get('clientContext') as string)
    expect(context.entryPointIntent).toBe(expectedIntent)
  })

  it('registers recovery translations when the conversation is opened through the app layout', async () => {
    mocks.pathname = '/support'
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      expiresAt: Date.now() + 3_600_000, userId: 'test-user', refreshFailed: false,
    })))
    setApiFetchTranslate(() => 'unregistered')
    render(<AppLayout><p>Support</p></AppLayout>)

    await waitFor(() => expect(translateApiFetchMessage('errors.api.appUpdated')).toBe('errors.api.appUpdated'))
  })

  it('omits Support entry intent from a normal conversation', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    useUIStore.getState().setAstraConversationOpen(true)

    await act(async () => { await result.current.sendMessage('log water') })

    const [, request] = mocks.fetch.mock.calls[0]!
    const context = JSON.parse((request.body as FormData).get('clientContext') as string)
    expect(context).not.toHaveProperty('entryPointIntent')
    expect(context.supportsMetricsCard).toBe(true)
    expect(context.supportsPeriodInsightCard).toBe(true)

  })

  it('publishes the stream refusal deadline without replaying the send', async () => {
    const payload = { error: 'Too many requests', requestId: 'stream-reference', limit: 10, count: 11, retryAfterUtc: '2026-09-06T00:00:42.000Z' }
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(payload), { status: 429 }))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => { await result.current.sendMessage('hello') })

    expect(getErrorSurface(useThrottleStore.getState().error)).toEqual({ requestId: 'stream-reference', retryAt: Date.parse(payload.retryAfterUtc) })
    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(useChatStore.getState().isTyping).toBe(false)
  })

  it.each([
    [429, '{'],
    [429, JSON.stringify({ error: 'Too many requests', retryAfterUtc: 'invalid' })],
    [500, JSON.stringify({ retryAfterUtc: '2026-09-06T00:00:42.000Z' })],
  ])('keeps untimed or non-throttle failures local (%s, %s)', async (status, body) => {
    mocks.fetch.mockResolvedValue(new Response(body, { status }))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.sendMessage('hello') })
    expect(useThrottleStore.getState().error).toBeNull()
    expect(result.current.sendError).toBeTruthy()
  })

  it('finishes a live stream after the same account recovers', async () => {
    signInAs('user-1')
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const { result } = renderHook(() => useChatComposer())

    let send!: Promise<void>
    act(() => { send = result.current.sendMessage('Keep this send') })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    await act(async () => {
      refuseSessionRefresh()
      await useAuthStore.getState().confirmSessionRefreshFailure()
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-1' })
      await useAuthStore.getState().recoverSessionRefreshFailure()
    })
    await act(async () => {
      stream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Still yours' })))
      stream.close()
      await send
    })

    expect(useChatStore.getState().messages.at(-1)?.content).toBe('Still yours')
    expect(mocks.queryClient.setQueryData).toHaveBeenCalledOnce()
  })

  it('streams deltas into a single ai bubble and the final response wins', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"started"}'),
      frame('{"type":"delta","text":"Hel"}'),
      frame('{"type":"delta","text":"lo"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Hello!', correlationId: 'trace-1', metricsCard: {
        period: 'week', completionRate: 50, totalCompletions: 1, totalScheduled: 2,
        activeDays: 1, currentStreak: 1, bestStreak: 1, hasData: true, surfaceId: 'progress',
      } })),
    ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hi')
    })

    const messages = useChatStore.getState().messages
    expect(messages.filter((message) => message.role === 'ai')).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'Hello!',
      correlationId: 'trace-1',
      metricsCard: { completionRate: 50 },
    })
    expect(useChatStore.getState().isTyping).toBe(false)
    expect(result.current.canRetryLastSend).toBe(false)
  })

  it('rejects an overlapping send before a second request starts', async () => {
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const { result } = renderHook(() => useChatComposer())

    let firstSend!: Promise<void>
    act(() => {
      firstSend = result.current.sendMessage('first')
      stream.enqueue(frame('{"type":"delta","text":"Working"}'))
    })
    await waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())

    await act(async () => {
      await result.current.sendMessage('second')
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
      await firstSend
    })

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().messages.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('preserves the active streamed message when the composer remounts', async () => {
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const firstComposer = renderHook(() => useChatComposer())

    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = firstComposer.result.current.sendMessage('hello')
      stream.enqueue(frame('{"type":"delta","text":"Working [[or"}'))
    })
    await waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())

    const activeMessageId = useChatStore.getState().streamingMessageId
    expect(activeMessageId).not.toBeNull()
    firstComposer.unmount()

    const remountedComposer = renderHook(() => useChatComposer())
    expect(remountedComposer.result.current.streamingMessageId).toBe(activeMessageId)

    await act(async () => {
      stream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Done' })))
      stream.close()
      await sendPromise
    })
    expect(remountedComposer.result.current.streamingMessageId).toBeNull()
  })

  it('keeps a newer stream active when the finalized request finishes invalidating', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    const firstStream = controlledSseResponse()
    const secondStream = controlledSseResponse()
    mocks.fetch
      .mockResolvedValueOnce(firstStream.response)
      .mockResolvedValueOnce(secondStream.response)
    const { result } = renderHook(() => useChatComposer())

    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = result.current.sendMessage('finish this')
      firstStream.enqueue(frame('{"type":"delta","text":"Working [[or"}'))
      firstStream.enqueue(finalFrame(makeChatResponse({
        aiMessage: 'Final list: [',
        operations: [{
          operationId: 'operation-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
        }],
      })))
      firstStream.close()
    })

    await waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Final list: ['))
    expect(useChatStore.getState().streamingMessageId).toBeNull()
    expect(result.current.isSending).toBe(false)

    let secondSendPromise!: Promise<void>
    act(() => {
      secondSendPromise = result.current.sendMessage('start another')
      secondStream.enqueue(frame('{"type":"delta","text":"Still [[or"}'))
    })
    await waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())
    const secondDraftId = useChatStore.getState().streamingMessageId

    await act(async () => {
      resolveInvalidations()
      await sendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBe(secondDraftId)

    await act(async () => {
      secondStream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Second final' })))
      secondStream.close()
      await secondSendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBeNull()
  })

  it('clears the streamed draft on reset so the final answer is not duplicated', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"delta","text":"Checking"}'),
      frame('{"type":"reset"}'),
      frame('{"type":"round","iteration":1}'),
      frame('{"type":"delta","text":"Done"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Done' })),
    ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('check my goals')
    })

    const aiMessages = useChatStore.getState().messages.filter((message) => message.role === 'ai')
    expect(aiMessages).toHaveLength(1)
    expect(aiMessages[0]?.content).toBe('Done')
  })

  it('arms retry with the timeout copy when the stream goes idle past the watchdog', async () => {
    vi.useFakeTimers()
    mocks.fetch.mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      const sendPromise = result.current.sendMessage('hello')
      await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS)
      await sendPromise
    })

    expect(result.current.sendError).toBe('chat.timeoutError')
    expect(result.current.canRetryLastSend).toBe(true)
    expect(useChatStore.getState().isTyping).toBe(false)
  })

  it('adds the daily allowance event inline without arming retry', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"started"}'),
      frame('{"type":"error","status":403,"error":"limit reached"}'),
    ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.sendError).toBeNull()
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'shell.composer.limit.reason:{"allowance":5}',
    })
    expect(result.current.canRetryLastSend).toBe(false)
  })

  it('retries the failed send without duplicating the user message', async () => {
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"started"}'),
        frame('{"type":"step","domain":"habits","access":"read"}'),
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"delta","text":"Recovered"}'),
        finalFrame(makeChatResponse({ aiMessage: 'Recovered' })),
      ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('log water')
    })
    expect(result.current.canRetryLastSend).toBe(true)
    expect(result.current.activeSteps).toEqual([])
    expect(useChatStore.getState().messages.every((message) => !message.toolSteps?.length)).toBe(true)

    await act(async () => {
      await result.current.retryLastSend()
    })

    const messages = useChatStore.getState().messages
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({ role: 'ai', content: 'Recovered' })
    expect(result.current.canRetryLastSend).toBe(false)
    expect(result.current.sendError).toBeNull()
  })

  it('clears an untouched restored draft after a successful retry', async () => {
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('log water'))
    await act(async () => {
      await result.current.sendMessage()
    })
    expect(result.current.composerProps.value).toBe('log water')

    await act(async () => {
      await result.current.retryLastSend()
    })

    expect(result.current.composerProps.value).toBe('')
    expect(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('keeps a same-valued newer edit while a successful retry finishes invalidating', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse({
        operations: [{
          operationId: 'operation-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
        }],
      }))))
    const { result } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('log water'))
    await act(async () => {
      await result.current.sendMessage()
    })

    let retryPromise!: Promise<void>
    act(() => {
      retryPromise = result.current.retryLastSend()
    })
    await waitFor(() => expect(result.current.isSending).toBe(false))
    act(() => result.current.setInput('log water'))

    await act(async () => {
      resolveInvalidations()
      await retryPromise
    })

    expect(result.current.composerProps.value).toBe('log water')
  })

  it('keeps a same-valued draft restored by a fast repeat send failure', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse({
        operations: [{
          operationId: 'operation-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
        }],
      }))))
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"error","status":500,"error":"boom again"}'),
      ))
    const { result } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('log water'))
    await act(async () => {
      await result.current.sendMessage()
    })

    let retryPromise!: Promise<void>
    act(() => {
      retryPromise = result.current.retryLastSend()
    })
    await waitFor(() => expect(result.current.isSending).toBe(false))
    await act(async () => {
      await result.current.sendMessage()
    })
    expect(result.current.composerProps.value).toBe('log water')

    await act(async () => {
      resolveInvalidations()
      await retryPromise
    })

    expect(result.current.composerProps.value).toBe('log water')
  })

  it('keeps a newer draft edit when an in-flight retry fails', async () => {
    const retryStream = controlledSseResponse()
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(retryStream.response)
    const { result } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('log water'))
    await act(async () => {
      await result.current.sendMessage()
    })

    let retryPromise!: Promise<void>
    act(() => {
      retryPromise = result.current.retryLastSend()
    })
    act(() => result.current.setInput('log water and vitamins'))

    await act(async () => {
      retryStream.enqueue(frame('{"type":"error","status":500,"error":"boom again"}'))
      retryStream.close()
      await retryPromise
    })

    expect(result.current.composerProps.value).toBe('log water and vitamins')
  })

  it('keeps an intentionally cleared draft when its retry fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseResponse(
        frame('{"type":"error","status":500,"error":"boom again"}'),
      ))
    const { result } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('log water'))
    await act(async () => {
      await result.current.sendMessage()
    })
    expect(result.current.composerProps.value).toBe('log water')

    act(() => result.current.setInput(''))
    await act(async () => {
      await result.current.retryLastSend()
    })

    expect(result.current.composerProps.value).toBe('')
    expect(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('maps a pre-stream http failure through the same classification', async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({ error: "You've reached your daily AI message limit (5).", errorCode: 'PAY_GATE' }, { status: 403 }),
    )
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    expect(result.current.sendError).toBeNull()
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'shell.composer.limit.reason:{"allowance":5}',
    })
    expect(result.current.canRetryLastSend).toBe(false)
    expect(mocks.routerPush).not.toHaveBeenCalledWith('/upgrade')
  })

  it('replaces a streamed draft with the daily allowance when the stream reaches the limit', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(
      frame('{"type":"started"}'),
      frame('{"type":"delta","text":"Checking"}'),
      frame('{"type":"error","status":403,"error":"limit reached"}'),
    ))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('check my habits')
    })

    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'shell.composer.limit.reason:{"allowance":5}',
    })
    expect(result.current.sendError).toBeNull()
    expect(result.current.canRetryLastSend).toBe(false)
  })

  it('submits a pasted image with nonblank text through the rendered composer', async () => {
    const pastedImage = new File(['image'], 'pasted.jpg', { type: 'image/jpeg' })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:pasted-image'),
      revokeObjectURL: vi.fn(),
    })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))

    function ComposerHarness() {
      const { composerProps } = useChatComposer()
      return <Composer {...composerProps} />
    }

    render(<ComposerHarness />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'shell.composer.placeholder' }), {
      clipboardData: {
        items: [{ type: pastedImage.type, getAsFile: () => pastedImage }],
      },
    })

    expect(screen.getByRole('list', { name: 'shell.composer.attach.trayLabel' })).toBeInTheDocument()
    expect(screen.getByText('pasted.jpg')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'shell.composer.placeholder' }), {
      target: { value: 'log my walk' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('log my walk')
    expect(requestBody.get('image')).toBe(pastedImage)
  })

  it('reads a valid text file, folds it into the sent message, and clears it', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const file = textFile('notes.txt', 'Walk\nRead')
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(file))
    })
    expect(result.current.selectedTextFile).toEqual({
      name: 'notes.txt',
      content: 'Walk\nRead',
    })

    act(() => result.current.setInput('Import these'))
    await act(async () => {
      await result.current.sendMessage()
    })

    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe(
      'Import these\n\nchat.fileAttached:{"name":"notes.txt"}\nWalk\nRead',
    )
    expect(result.current.selectedTextFile).toBeNull()
  })

  it('rejects an unsupported text-file extension', async () => {
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(textFile('notes.pdf', 'text')))
    })

    expect(result.current.sendError).toBe('chat.fileError')
    expect(result.current.selectedTextFile).toBeNull()
  })

  it('rejects a text file over 1 MiB', async () => {
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(
        fileChangeEvent(textFile('large.txt', 'text', 1024 * 1024 + 1)),
      )
    })

    expect(result.current.sendError).toBe('chat.fileSizeError')
    expect(result.current.selectedTextFile).toBeNull()
  })

  it('surfaces a text-file read failure', async () => {
    const file = textFile('notes.md', 'text')
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('read failed')),
    })
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(file))
    })

    expect(result.current.sendError).toBe('chat.fileReadError')
    expect(result.current.selectedTextFile).toBeNull()
  })

  it('does nothing when text-file selection is canceled', async () => {
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent())
    })

    expect(result.current.sendError).toBeNull()
    expect(result.current.selectedTextFile).toBeNull()
  })

  it('removes text-file and image attachments independently by id', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:selected-image'),
      revokeObjectURL: vi.fn(),
    })
    const textAttachment = textFile('notes.txt', 'Walk')
    const image = new File(['image'], 'walk.png', { type: 'image/png' })
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(textAttachment))
    })
    act(() => result.current.handleFileSelect(fileChangeEvent(image)))
    expect(result.current.composerProps.attachments).toHaveLength(2)

    act(() => result.current.composerProps.onAttachRemove?.('chat-file'))
    expect(result.current.selectedTextFile).toBeNull()
    expect(result.current.selectedImage).toBe(image)

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(textAttachment))
    })
    act(() => result.current.composerProps.onAttachRemove?.('chat-image'))
    expect(result.current.selectedTextFile?.name).toBe('notes.txt')
    expect(result.current.selectedImage).toBeNull()
  })

  it('allows a file-only send and blocks an image-only send', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:selected-image'),
      revokeObjectURL: vi.fn(),
    })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(textFile('notes.txt', 'Walk')))
    })
    act(() => result.current.composerProps.onSend())
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())

    act(() => result.current.handleFileSelect(
      fileChangeEvent(new File(['image'], 'walk.png', { type: 'image/png' })),
    ))
    act(() => result.current.composerProps.onSend())
    await act(async () => Promise.resolve())
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('blocks sending while offline and re-enables once back online', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    try {
      const { result } = renderHook(() => useChatComposer())

      act(() => {
        result.current.setInput('hello')
      })

      expect(result.current.isOnline).toBe(false)
      expect(result.current.canSend).toBe(false)
      expect(result.current.composerProps.state).toBe('offline')
      expect(result.current.composerProps.words.placeholder).toBe('shell.composer.offline.placeholder')
      expect(result.current.composerProps.words.inputLabel).toBe('shell.composer.placeholder')

      act(() => {
        Object.defineProperty(globalThis.navigator, 'onLine', {
          configurable: true,
          value: true,
        })
        globalThis.dispatchEvent(new Event('online'))
      })

      expect(result.current.isOnline).toBe(true)
      expect(result.current.canSend).toBe(true)
    } finally {
      Reflect.deleteProperty(globalThis.navigator, 'onLine')
    }
  })

  it.each([
    [false, 5],
    [true, 50],
  ])('states the daily allowance at the message limit, pro=%s', (hasProAccess, allowance) => {
    mocks.state.profile = createMockProfile({
      hasProAccess,
      aiMessagesUsed: allowance,
      aiMessagesLimit: allowance,
      timeZone: 'America/New_York',
    })

    const { result } = renderHook(() => useChatComposer())
    expect(result.current.composerProps.limitReason).toBe(
      `shell.composer.limit.reason:{"allowance":${allowance}}`,
    )
    expect(result.current.composerProps.limitReason).not.toContain('resetsAt')
    expect(result.current.composerProps.limitReason).not.toContain('midnight')
  })

  it('shows the daily allowance instead of sending when the account is already at its limit', async () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 5,
      aiMessagesLimit: 5,
    })
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('plan my morning')
    })

    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'shell.composer.limit.reason:{"allowance":5}',
    })
    expect(result.current.sendError).toBeNull()
  })

  it('keeps the draft and explains that sending is unavailable offline', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    const { result } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('log my walk'))
    await act(async () => {
      await result.current.sendMessage()
    })

    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(result.current.composerProps.value).toBe('log my walk')
    expect(result.current.sendError).toBe('shell.composer.offline.reason')
    Reflect.deleteProperty(globalThis.navigator, 'onLine')
  })

  it('restores a saved draft into the rendered composer', async () => {
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'saved walk')

    const { result } = renderHook(() => useChatComposer())

    await waitFor(() => expect(result.current.composerProps.value).toBe('saved walk'))
  })

  it('keeps text entered into the server rendered composer before hydration', async () => {
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'saved walk')

    function ComposerHarness() {
      const { composerProps, composerInputId } = useChatComposer()
      return <Composer {...composerProps} inputId={composerInputId} />
    }

    const container = document.createElement('div')
    container.innerHTML = renderToString(<ComposerHarness />)
    document.body.appendChild(container)
    const field = container.querySelector('textarea')
    if (!field) throw new Error('Expected server rendered composer textarea')
    field.value = 'typed before hydration'

    try {
      render(<ComposerHarness />, { container, hydrate: true })
      await waitFor(() => expect(field).toHaveValue('typed before hydration'))
      await waitFor(() => expect(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBe('typed before hydration'))
    } finally {
      container.remove()
    }
  })

  it('shares a selected Today draft with a newly mounted conversation composer', () => {
    const todayComposer = renderHook(() => useChatComposer())

    act(() => todayComposer.result.current.setInput('Help me create a morning walk habit'))
    const conversationComposer = renderHook(() => useChatComposer())

    expect(conversationComposer.result.current.composerProps.value).toBe(
      'Help me create a morning walk habit',
    )
  })

  it('commits a finished voice transcript and then exposes transcribing', () => {
    mocks.state.isRecording = true
    mocks.state.transcript = 'walked outside'
    const { result, rerender } = renderHook(() => useChatComposer())

    act(() => result.current.setInput('I'))
    mocks.state.isRecording = false
    rerender()
    expect(result.current.composerProps.value).toBe('I walked outside')

    mocks.state.isTranscribing = true
    rerender()
    expect(result.current.composerProps.state).toBe('transcribing')
    expect(result.current.composerProps.onVoice).toBe(mocks.toggleRecording)
  })

  it('keeps an active recording stoppable and explains a lost connection', () => {
    mocks.state.isRecording = true
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
    try {
      const { result } = renderHook(() => useChatComposer())
      expect(result.current.composerProps.state).toBe('recording')
      expect(result.current.composerProps.words.offlineReason).toBe('shell.composer.offline.reason')
      expect(result.current.composerProps.onVoice).toBe(mocks.toggleRecording)
    } finally {
      Reflect.deleteProperty(globalThis.navigator, 'onLine')
    }
  })

  it('clears a new speech permission error after its visible timeout', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(() => useChatComposer())

    mocks.state.speechError = 'microphone denied'
    rerender()
    expect(result.current.sendError).toBe('microphone denied')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(result.current.sendError).toBeNull()
  })

  it('omits voice when speech is unavailable at the account limit', () => {
    mocks.state.speechSupported = false
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
    })

    const { result } = renderHook(() => useChatComposer())

    expect(result.current.composerProps.state).toBe('atLimit')
    expect(result.current.composerProps.onVoice).toBeUndefined()
  })

  it('explains the connection first when offline at the account limit', () => {
    mocks.state.profile = createMockProfile({ hasProAccess: false, aiMessagesUsed: 20, aiMessagesLimit: 20 })
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
    try {
      const { result } = renderHook(() => useChatComposer())
      expect(result.current.composerProps.state).toBe('offline')
      expect(result.current.composerProps.limitReason).toBe('shell.composer.offline.reason')
    } finally {
      Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
    }
  })

  it('arms retry when the transport fails before a response', async () => {
    mocks.fetch.mockRejectedValue(new Error('network unavailable'))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('log water')
    })

    expect(result.current.sendError).toBe('chat.sendError')
    expect(result.current.canRetryLastSend).toBe(true)
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('disarms the previous account retry when another account replaces it', async () => {
    signInAs('user-1')
    mocks.fetch.mockRejectedValue(new Error('network unavailable'))
    const { result } = renderHook(() => useChatComposer())
    useUIStore.getState().setAstraConversationOpen(true, 'support')

    await act(async () => {
      await result.current.sendMessage('cancel my 9pm meds reminder')
    })
    expect(result.current.canRetryLastSend).toBe(true)
    expect(result.current.composerProps.onRetry).toBeTypeOf('function')
    expect(result.current.sendError).toBe('chat.sendError')

    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-2' })
      await useAuthStore.getState().checkSession()
    })

    expect(result.current.canRetryLastSend).toBe(false)
    expect(result.current.composerProps.onRetry).toBeUndefined()
    expect(result.current.sendError).toBeNull()
    expect(useUIStore.getState().astraEntryPointIntent).toBeUndefined()
  })

  it('keeps the retry armed when the same account recovers from a rejected refresh', async () => {
    signInAs('user-1')
    mocks.fetch.mockRejectedValue(new Error('network unavailable'))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('cancel my 9pm meds reminder')
    })
    expect(result.current.canRetryLastSend).toBe(true)

    await act(async () => {
      refuseSessionRefresh()
      await useAuthStore.getState().confirmSessionRefreshFailure()
    })
    expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-1' })
      await useAuthStore.getState().recoverSessionRefreshFailure()
    })

    expect(result.current.canRetryLastSend).toBe(true)
    expect(result.current.composerProps.onRetry).toBeTypeOf('function')
    expect(result.current.sendError).toBe('chat.sendError')
  })

  it.each([
    ['final', finalFrame(makeChatResponse({ aiMessage: 'Account A answer' }))],
    ['failure', frame('{"type":"error","error":"Account A failed","status":500}')],
  ])('discards a late %s stream after account replacement', async (_, outcome) => {
    signInAs('user-1')
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const { result } = renderHook(() => useChatComposer())

    let send!: Promise<void>
    act(() => { send = result.current.sendMessage('Account A prompt') })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    act(() => stream.enqueue(frame('{"type":"step","domain":"habits","access":"read"}')))
    await waitFor(() => expect(result.current.activeSteps).toHaveLength(1))

    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-2' })
      await useAuthStore.getState().checkSession()
    })
    act(() => useChatStore.getState().setDraft('Account B draft'))

    await act(async () => {
      stream.enqueue(frame('{"type":"delta","text":"Account A partial"}'))
      stream.enqueue(outcome)
      stream.close()
      await send
    })

    expect(useChatStore.getState().messages).toEqual([])
    expect(useChatStore.getState().draft).toBe('Account B draft')
    expect(useChatStore.getState().isTyping).toBe(false)
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(result.current.canRetryLastSend).toBe(false)
    expect(result.current.sendError).toBeNull()
    expect(result.current.activeSteps).toEqual([])
  })

  it('drops the previous account text file when another account replaces it', async () => {
    signInAs('user-1')
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(textFile('notes.txt', 'Walk')))
    })
    expect(result.current.selectedTextFile?.name).toBe('notes.txt')

    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-2' })
      await useAuthStore.getState().checkSession()
    })

    expect(result.current.selectedTextFile).toBeNull()
  })

  it('discards a text file that finishes reading after account replacement', async () => {
    signInAs('user-1')
    let finishRead!: (content: string) => void
    const file = textFile('account-a.txt', 'unused')
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: () => new Promise<string>((resolve) => { finishRead = resolve }),
    })
    const { result } = renderHook(() => useChatComposer())

    let read!: Promise<void>
    act(() => { read = result.current.handleTextFileSelect(fileChangeEvent(file)) })
    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-2' })
      await useAuthStore.getState().checkSession()
    })
    await act(async () => {
      finishRead('Account A secret')
      await read
    })

    expect(result.current.selectedTextFile).toBeNull()
    expect(result.current.sendError).toBeNull()
  })

  it('keeps the text file when the same account recovers from a rejected refresh', async () => {
    signInAs('user-1')
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.handleTextFileSelect(fileChangeEvent(textFile('notes.txt', 'Walk')))
    })
    expect(result.current.selectedTextFile?.name).toBe('notes.txt')

    await act(async () => {
      refuseSessionRefresh()
      await useAuthStore.getState().confirmSessionRefreshFailure()
    })
    await act(async () => {
      answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-1' })
      await useAuthStore.getState().recoverSessionRefreshFailure()
    })

    expect(result.current.selectedTextFile?.name).toBe('notes.txt')
  })

  it('synchronizes the Today route date before chips settle', () => {
    mocks.pathname = '/'
    mocks.searchParams = 'date=2026-09-11'
    answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-1' })
    render(<AppLayout><div>Today</div></AppLayout>)
    expect(mocks.state.habitFilters.at(-1)?.dateFrom).toBe('2026-09-11')
  })

  it('queries the selected day with the visible Today general filter', () => {
    renderHook(() => useChatComposer({ pathname: '/', today: '2026-09-12', selectedDate: '2026-09-11', includeGeneral: true }))
    expect(mocks.state.habitFilters.at(-1)).toMatchObject({
      dateFrom: '2026-09-11', dateTo: '2026-09-11', includeOverdue: false, includeGeneral: true,
    })
  })

  it('matches the shared chip builder on primary routes', () => {
    const habit = createMockHabit({ title: 'Read', linkedGoals: [], isCompleted: false })
    mocks.state.profile = createMockProfile({ lastCompletionDate: null, currentStreak: 0, longestStreak: 0, aiSummaryEnabled: true, hasGoogleConnection: true })
    mocks.state.habitData = { topLevelHabits: [habit], totalCount: 1 }
    for (const [pathname, surface] of [['/', 'today'], ['/calendar', 'calendar'], ['/progress', 'progress'], ['/profile', 'profile']] as const) {
      const expected = buildComposerChips({ surface, status: 'success', habits: [habit], totalHabitCount: 1, profile: mocks.state.profile }).map((chip) => chip.id)
      const { result, unmount } = renderHook(() => useChatComposer({ pathname, totalHabitCount: 1 }))
      expect(result.current.composerProps.suggestions.map((chip) => chip.id)).toEqual(expected)
      unmount()
    }
  })

  it('gates Calendar chips on the Calendar error rather than the Today query', () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = null
    const { result } = renderHook(() => useChatComposer({ pathname: '/calendar' }))
    expect(result.current.composerProps.suggestions.map((chip) => chip.id)).toEqual([
      'today.logYesterday', 'calendar.slippedThisWeek', 'today.changeTimes',
    ])
    act(() => useUIStore.getState().setCalendarHasError(true))
    expect(result.current.composerProps.suggestions).toEqual([])
  })

  it('queries every habit when choosing Progress goal chips', () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    renderHook(() => useChatComposer({ pathname: '/progress' }))
    expect(mocks.state.habitFilters.at(-1)).toEqual({})
  })

  it('sends a live suggestion label in the transport payload', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    const { result } = renderHook(() => useChatComposer())
    const suggestion = result.current.composerProps.suggestions[0]!

    act(() => suggestion.onSelect())
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe(suggestion.label)
  })

  it('keeps a Progress goal request available beside an existing draft', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    useChatStore.setState({ draft: 'Unsent note', contextualSuggestion: {
      id: 'progress-create-goal', label: 'Create a goal', prompt: 'Help me make a goal',
    } })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname: '/progress' }))
    expect(result.current.composerProps.suggestions[0]?.id).toBe('progress-create-goal')
    act(() => result.current.composerProps.suggestions[0]?.onSelect())
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('Help me make a goal')
    expect(useChatStore.getState().draft).toBe('Unsent note')
  })

  it('uses loaded habit detail while the separate day query is unavailable', () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = null
    mocks.state.detail = makeHabitDetail()
    const { result } = renderHook(() => useChatComposer({ pathname: '/habits/habit-1' }))
    expect(result.current.composerProps.suggestions.map((chip) => chip.id)).toEqual([
      'habitDetail.askAstra', 'habitDetail.pauseThisWeek', 'habitDetail.rename',
    ])
  })

  it('sends the habit detail seed prompt', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = makeHabitDetail()
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname: '/habits/habit-1' }))
    const suggestion = result.current.composerProps.suggestions[0]!
    expect(suggestion.id).toBe('habitDetail.askAstra')
    act(() => suggestion.onSelect())
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('habits.detail.askAstraSeedDefault:{"title":"Read"}')
  })

  it('refreshes every affected list after successful live actions', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse({
      actions: [
        { type: 'CreateHabit', status: 'Success' },
        { type: 'CreateGoal', status: 'Success' },
        { type: 'CreateTag', status: 'Success' },
      ],
      operations: [{
        operationId: 'operation-1',
        sourceName: 'CreateHabit',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        status: 'Succeeded',
      }],
    }))))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('set up my week')
    })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: tagKeys.lists() })
  })

  it('refreshes the returning profile after a successful live log action', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse({
      actions: [{ type: 'LogHabit', status: 'Success' }],
    }))))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => { await result.current.sendMessage('log water') })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })

  it('keeps a final policy denial in the conversation without upgrade routing', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse({
      policyDenials: [{
        operationId: 'operation-1',
        sourceName: 'CreateGoal',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        reason: 'Yearly Pro plan required',
      }],
    }))))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('make a yearly goal')
    })

    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('refuses a concurrent send inline without queuing another request', async () => {
    useChatStore.setState({ isTyping: true })
    const { result } = renderHook(() => useChatComposer())

    await act(async () => result.current.sendMessage('second message'))

    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(result.current.sendError).toBe('shell.composer.busy.reason')
  })

  it('increments the current non-pro usage cache after a final response', async () => {
    mocks.state.profile = createMockProfile({ hasProAccess: false, aiMessagesUsed: 4 })
    let updatedProfile: Profile | undefined
    mocks.queryClient.setQueryData.mockImplementationOnce(
      (
        _queryKey: readonly unknown[],
        updater: Profile | ((current: Profile | undefined) => Profile | undefined),
      ) => {
        updatedProfile = typeof updater === 'function' ? updater(mocks.state.profile) : updater
      },
    )
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => {
      await result.current.sendMessage('log water')
    })

    expect(updatedProfile?.aiMessagesUsed).toBe(5)
  })

  it('refreshes habits after a confirmed breakdown', () => {
    const { result } = renderHook(() => useChatComposer())

    result.current.handleBreakdownConfirmed()

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.searches() })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.lists(),
    })
  })
})
