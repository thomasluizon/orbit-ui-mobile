import type { InvalidateQueryFilters } from '@tanstack/react-query'
import { choiceBlockFixture, pickListBlockFixture, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { describe, expect, it, vi, beforeEach, afterEach, onTestFinished } from 'vitest'
import { renderHook, act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '@orbit/shared/chat'
import { createMockHabit, createMockProfile, createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { buildComposerChips } from '@orbit/shared/chat'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { prepareChatRequest } from '@orbit/shared/stores'
import { goalKeys, habitKeys, profileKeys, tagKeys } from '@orbit/shared/query'
import { chatResponseSchema, type ChatResponse } from '@orbit/shared/types/chat'
import partsFixture from '@orbit/shared/test-support/chat-parts.fixture.json'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitDetail, HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { canReloadDesktopWeb } from '@/lib/desktop-web-release'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mocks = vi.hoisted(() => ({
  translate: undefined as ReturnType<typeof createTranslator<typeof en>> | undefined,
  locale: 'en',
  pathname: '/support',
  searchParams: '',
  state: {
    profile: undefined as Profile | undefined,
    habitData: { topLevelHabits: [] as NormalizedHabit[], totalCount: 0 } as { topLevelHabits: NormalizedHabit[]; totalCount: number } | null,
    detail: null as HabitDetail | null,
    habitFilters: [] as HabitsFilter[],
    habitsError: false,
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
    isMutating: () => 0,
    invalidateQueries: vi.fn(async (_filters?: InvalidateQueryFilters) => {}),
    setQueryData: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('next-intl', async (importOriginal) => ({
  ...await importOriginal<typeof import('next-intl')>(),
  useTranslations: () => mocks.translate ?? ((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key),
  useLocale: () => mocks.locale,
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
vi.mock('@/hooks/use-retained-onboarding-guard', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-retained-onboarding-guard')>(),
  useRetainedOnboardingGuard: () => false,
}))
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

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
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
  useHabits: (filters: HabitsFilter) => { mocks.state.habitFilters.push(filters); return { data: mocks.state.habitData, isError: mocks.state.habitsError } },
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

vi.mock('@/app/actions/chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/actions/chat')>()),
  getCurrentProactiveItem: vi.fn().mockResolvedValue(null),
  getProactiveItemStatus: vi.fn(),
  reportProactiveOpened: vi.fn(),
  reportProactiveActed: vi.fn(),
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
    fail: (error: Error) => streamController.error(error),
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
  return <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
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
  it('keeps desktop reloads blocked through a real streamed send and voice input', async () => {
    useUIStore.setState({ showCreateModal: false, openOverlayIds: [], selectedHabitIds: new Set() })
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValueOnce(stream.response)
    const { result, rerender } = renderHook(() => useChatComposer())
    expect(canReloadDesktopWeb()).toBe(true)
    let pending!: Promise<void>
    await act(async () => { pending = result.current.sendMessage('Help me plan'); await Promise.resolve() })
    expect(canReloadDesktopWeb()).toBe(false)
    await act(async () => { stream.enqueue(frame('{"type":"delta","text":"Start"}')) })
    expect(canReloadDesktopWeb()).toBe(false)
    await act(async () => { stream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Start with water' }))); stream.close(); await pending })
    expect(canReloadDesktopWeb()).toBe(true)
    mocks.state.isRecording = true
    rerender()
    expect(canReloadDesktopWeb()).toBe(false)
    mocks.state.isRecording = false
    mocks.state.isTranscribing = true
    rerender()
    expect(canReloadDesktopWeb()).toBe(false)
    mocks.state.isTranscribing = false
    rerender()
    expect(canReloadDesktopWeb()).toBe(true)
  })
  it.each([
    ['message', 'http'], ['message', 'sse'],
    ['block answer', 'http'], ['block answer', 'sse'],
  ] as const)('stops a replayed %s at the daily ceiling over %s despite failed reconciliation', async (submission, transport) => {
    const refusal = { error: 'Your daily AI safety budget has been reached. Please try again tomorrow.', errorCode: 'AI_DAILY_BUDGET_EXCEEDED' }
    mocks.fetch.mockResolvedValueOnce(sseResponse(frame('{"type":"delta","text":"Unfinished reply"}')))
      .mockResolvedValueOnce(transport === 'http'
        ? Response.json(refusal, { status: 400 })
        : sseResponse(frame('{"type":"error","status":400,"error":"Daily budget reached","code":"AI_DAILY_BUDGET_EXCEEDED"}')))
    mocks.queryClient.invalidateQueries.mockRejectedValue(new Error('Refetch unavailable'))
    const { result: composer, rerender } = renderHook(({ today }) => useChatComposer({ today }), { initialProps: { today: '2026-09-12' } })
    const request = { kind: 'choice' as const, answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: ['Evening'] }
    const draft = '  Keep this draft\n  '
    act(() => composer.current.setInput(draft))
    await act(async () => {
      if (submission === 'message') await composer.current.sendMessage()
      else expect(await composer.current.blockAnswerInteraction.send(request)).toEqual({ ok: false, status: 400, dailyBudgetReached: true })
    })
    expect(composer.current.composerProps.state).toBe('atLimit')
    if (composer.current.composerProps.state === 'atLimit') expect(composer.current.composerProps.limitReason).toBe('chat.dailyBudgetReached')
    expect(composer.current.input).toBe(draft)
    expect(composer.current.sendError).toBeNull()
    expect(composer.current.messages.filter(message => message.role === 'ai')).toHaveLength(0)
    expect(composer.current.composerProps.onRetry).toBeUndefined()
    const readKey = (index: number) => new Headers((mocks.fetch.mock.calls[index]?.[1] as RequestInit).headers).get('Idempotency-Key')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(readKey(0)).toBeTruthy()
    expect(readKey(1)).toBe(readKey(0))
    expect((mocks.fetch.mock.calls[1]?.[1] as RequestInit).body).toBe((mocks.fetch.mock.calls[0]?.[1] as RequestInit).body)
    await act(async () => {
      await composer.current.retryLastSend()
      await composer.current.sendMessage()
      await composer.current.sendMessage('Suggestion')
      expect(await composer.current.blockAnswerInteraction.send(request)).toEqual({ ok: false, status: null })
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse({ aiMessage: 'New day reply' }))))
    rerender({ today: '2026-09-13' })
    await act(async () => {
      if (submission === 'message') await composer.current.sendMessage()
      else expect(await composer.current.blockAnswerInteraction.send(request)).toEqual({ ok: true })
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(readKey(2)).toBeTruthy()
    expect(readKey(2)).not.toBe(readKey(0))
    expect(composer.current.messages.some(message => message.content === 'New day reply')).toBe(true)
    expect(composer.current.atMessageLimit).toBe(false)
  })

  it.each([['en', 'http'], ['pt-BR', 'http'], ['en', 'sse'], ['pt-BR', 'sse']] as const)('keeps a daily ceiling refusal single and nonretryable in %s over %s', async (locale, transport) => {
    mocks.locale = locale
    const words = locale === 'en' ? en : ptBR
    mocks.translate = createTranslator({ locale, messages: words })
    mocks.state.profile = createMockProfile({ hasProAccess: true, aiMessagesUsed: 1, aiMessagesLimit: 50 })
    const refusal = { error: 'Your daily AI safety budget has been reached. Please try again tomorrow.', errorCode: 'AI_DAILY_BUDGET_EXCEEDED' }
    mocks.fetch.mockResolvedValue(transport === 'http' ? new Response(JSON.stringify(refusal), { status: 400 }) : sseResponse(frame('{"type":"delta","text":"Unfinished reply"}'), frame('{"type":"error","status":400,"error":"Daily budget reached","code":"AI_DAILY_BUDGET_EXCEEDED"}')))
    render(<ComposerConversationHarness />)
    const draft = '  Plan my morning\n  '
    fireEvent.change(screen.getByRole('textbox'), { target: { value: draft } })
    fireEvent.click(screen.getByRole('button', { name: words.shell.composer.send }))
    await waitFor(() => expect(screen.getAllByText(words.chat.dailyBudgetReached).filter(node => !node.closest('[inert]'))).toHaveLength(1))
    expect(screen.getByRole('textbox')).toHaveValue(draft)
    expect(screen.queryByText(words.chat.aiError)).not.toBeInTheDocument()
    expect(screen.queryByText(words.chat.sendError)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: words.shell.composer.retry })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: words.common.closeConversation }))
    expect(screen.getAllByText(words.chat.dailyBudgetReached).filter(node => !node.closest('[inert]'))).toHaveLength(1)
    expect(screen.getByRole('textbox')).toHaveValue(draft)
  })

  it.each(['http', 'sse'] as const)('blocks choice retries after a daily ceiling over %s', async transport => {
    useChatStore.setState({ draft: 'Keep this draft', messages: [makeHeldHabitMessage({ id: 'question', content: '', pendingOperations: [], parts: [{ type: 'block', kind: 'choice', block: choiceBlockFixture }] })] })
    mocks.fetch.mockResolvedValue(transport === 'http'
      ? Response.json({ error: 'Daily budget reached', errorCode: 'AI_DAILY_BUDGET_EXCEEDED' }, { status: 400 })
      : sseResponse(frame('{"type":"delta","text":"Preparing"}'), frame('{"type":"error","status":400,"error":"Daily budget reached","code":"AI_DAILY_BUDGET_EXCEEDED"}')))
    useUIStore.getState().setAstraConversationOpen(true)
    render(<ComposerConversationHarness />)
    fireEvent.click(screen.getAllByRole('radio')[2]!)
    fireEvent.click(screen.getByRole('button', { name: 'submit' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled())
    await waitFor(() => expect(screen.getAllByText('chat.dailyBudgetReached').filter(node => !node.closest('[inert]'))).toHaveLength(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Preparing')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'shell.composer.inputLabel' })).toHaveValue('Keep this draft')
    fireEvent.click(screen.getByRole('button', { name: 'submit' }))
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['image-plus-text', 'http'], ['image-plus-text', 'sse'],
    ['file-only', 'http'], ['file-only', 'sse'],
  ] as const)('preserves a refused %s draft and resends its attachments next date over %s', async (draftKind, transport) => {
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:draft-image'),
      revokeObjectURL: vi.fn(),
    }))
    const image = new File(['image'], 'walk.png', { type: 'image/png' })
    const draft = draftKind === 'image-plus-text' ? '  Import these\n  ' : ''
    const message = `${draft.trim() ? 'Import these\n\n' : ''}chat.fileAttached:{"name":"notes.txt"}\nWalk\nRead`
    mocks.fetch.mockResolvedValueOnce(transport === 'http'
      ? Response.json({ error: 'Daily budget reached', errorCode: 'AI_DAILY_BUDGET_EXCEEDED' }, { status: 400 })
      : sseResponse(frame('{"type":"error","status":400,"error":"Daily budget reached","code":"AI_DAILY_BUDGET_EXCEEDED"}')))
      .mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    const { result, rerender } = renderHook(({ today }) => useChatComposer({ today }), { initialProps: { today: '2026-09-12' } })
    await act(async () => { await result.current.handleTextFileSelect(fileChangeEvent(textFile('notes.txt', 'Walk\nRead'))) })
    act(() => {
      result.current.setInput(draft)
      if (draftKind === 'image-plus-text') result.current.handleFileSelect(fileChangeEvent(image))
    })
    await act(async () => { result.current.composerProps.onSend(); await Promise.resolve() })
    expect(result.current.input).toBe(draft)
    expect(result.current.selectedTextFile).toEqual({ name: 'notes.txt', content: 'Walk\nRead' })
    expect(result.current.selectedImage).toBe(draftKind === 'image-plus-text' ? image : null)
    expect(result.current.imagePreview).toBe(draftKind === 'image-plus-text' ? 'blob:draft-image' : null)
    expect(result.current.composerProps.attachments).toHaveLength(draftKind === 'image-plus-text' ? 2 : 1)
    expect(result.current.composerProps.state).toBe('atLimit')
    expect(result.current.canSend).toBe(false)
    expect(result.current.canRetryLastSend).toBe(false)
    await act(async () => {
      await result.current.sendMessage()
      await result.current.retryLastSend()
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    rerender({ today: '2026-09-13' })
    expect(result.current.canSend).toBe(true)
    await act(async () => { result.current.composerProps.onSend(); await Promise.resolve() })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    for (const call of mocks.fetch.mock.calls) {
      const payload = call[1].body as FormData
      expect(payload.get('message')).toBe(message)
      expect(payload.get('image')).toBe(draftKind === 'image-plus-text' ? image : null)
    }
    expect(result.current.input).toBe('')
    expect(result.current.composerProps.attachments).toHaveLength(0)
  })

  it('releases the daily ceiling on the next local date', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'Daily budget reached', errorCode: 'AI_DAILY_BUDGET_EXCEEDED' }, { status: 400 }))
      .mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    const { result, rerender } = renderHook(({ today }) => useChatComposer({ today }), { initialProps: { today: '2026-09-12' } })
    await act(async () => { await result.current.sendMessage('First request') })
    expect(result.current.atMessageLimit).toBe(true)
    rerender({ today: '2026-09-13' })
    expect(result.current.atMessageLimit).toBe(false)
    await act(async () => { await result.current.sendMessage('New day') })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it.each(['suggestion', 'followUp', 'pickList'] as const)('routes a daily ceiling from a %s request without retry', async entry => {
    mocks.state.profile = createMockProfile()
    mocks.fetch.mockResolvedValue(Response.json({ error: 'Daily budget reached', errorCode: 'AI_DAILY_BUDGET_EXCEEDED' }, { status: 400 }))
    const { result } = renderHook(() => useChatComposer())
    act(() => result.current.setInput('Keep this draft'))
    const request = { kind: 'pickList' as const, answer: { blockId: pickListBlockFixture.blockId, selectedIds: ['1'] }, labels: ['Walk'] }
    await act(async () => {
      if (entry === 'pickList') await result.current.blockAnswerInteraction.send(request)
      else if (entry === 'suggestion') { result.current.composerProps.suggestions[0]!.onSelect(); await Promise.resolve() }
      else await result.current.sendMessage('Follow up', 'followUp')
    })
    expect(result.current.composerProps.state).toBe('atLimit')
    expect(result.current.input).toBe('Keep this draft')
    expect(result.current.composerProps.onRetry).toBeUndefined()
    await act(async () => { await result.current.blockAnswerInteraction.send(request); await result.current.retryLastSend() })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['terminal', 'partial'] as const)('handles a daily ceiling in a %s SSE error without retry', async arrival => {
    const stream = arrival === 'partial' ? [frame('{"type":"delta","text":"Unfinished reply"}')] : []
    mocks.fetch.mockResolvedValue(sseResponse(...stream, frame('{"type":"error","status":400,"error":"Daily budget reached","code":"AI_DAILY_BUDGET_EXCEEDED"}')))
    const { result } = renderHook(() => useChatComposer())
    act(() => result.current.setInput('Keep this draft'))
    await act(async () => { await result.current.sendMessage() })
    expect(result.current.composerProps.state).toBe('atLimit')
    if (result.current.composerProps.state === 'atLimit') expect(result.current.composerProps.limitReason).toBe('chat.dailyBudgetReached')
    expect(result.current.input).toBe('Keep this draft')
    expect(result.current.messages.filter(message => message.role === 'ai')).toHaveLength(0)
    expect(result.current.composerProps.onRetry).toBeUndefined()
    await act(async () => { await result.current.retryLastSend(); await result.current.sendMessage(); await result.current.sendMessage('Suggestion') })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([400, 409, 429])('does not automatically resend HTTP %s', async status => {
    mocks.fetch.mockResolvedValue(Response.json({ code: 'CHAT_TURN_KEY_CONFLICT', error: 'The turn key belongs to another payload.' }, { status }))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.sendMessage('Plan my morning') })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['network', 'server'] as const)('resends once after a %s failure before acceptance', async failure => {
    if (failure === 'network') mocks.fetch.mockRejectedValueOnce(new TypeError('Disconnected'))
    else mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 503 }))
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.sendMessage('Plan my morning') })
    const readKey = (index: number) => new Headers((mocks.fetch.mock.calls[index]?.[1] as RequestInit).headers).get('Idempotency-Key')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(readKey(0)).toBeTruthy()
    expect(readKey(1)).toBe(readKey(0))
    expect(useChatStore.getState().messages.filter(message => message.role === 'ai')).toHaveLength(1)
  })

  it('keeps the original keyed turn after two failed transport attempts and manual retry', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('Disconnected')).mockRejectedValueOnce(new TypeError('Disconnected'))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.sendMessage('Plan my morning') })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.canRetryLastSend).toBe(true)
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    await act(async () => { await result.current.retryLastSend() })
    const readKey = (index: number) => new Headers((mocks.fetch.mock.calls[index]?.[1] as RequestInit).headers).get('Idempotency-Key')
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(readKey(1)).toBe(readKey(0))
    expect(readKey(2)).toBe(readKey(0))
    expect(useChatStore.getState().messages.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it.each(['terminal error', 'conflict', 'interrupted'] as const)('preserves manual retry identity and reconciliation for %s', async failure => {
    const order: string[] = []
    mocks.queryClient.invalidateQueries.mockImplementation(async () => { await Promise.resolve(); order.push('refetch') })
    if (failure === 'conflict') mocks.fetch.mockResolvedValueOnce(Response.json({ code: 'CHAT_TURN_KEY_CONFLICT', error: 'The turn key belongs to another payload.' }, { status: 409 }))
    else mocks.fetch.mockResolvedValueOnce(sseResponse(frame(JSON.stringify({ type: 'error', status: 503, error: 'Reply failed', ...(failure === 'interrupted' ? { code: 'CHAT_TURN_INTERRUPTED' } : {}) }))))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.sendMessage('Plan my morning') })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    if (failure === 'interrupted') {
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.all, refetchType: 'all' }, { throwOnError: true })
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.all, refetchType: 'all' }, { throwOnError: true })
    }
    order.length = 0
    mocks.fetch.mockImplementationOnce(async () => { order.push('send'); return sseResponse(finalFrame(makeChatResponse())) })
    await act(async () => { await result.current.retryLastSend() })
    const readKey = (index: number) => new Headers((mocks.fetch.mock.calls[index]?.[1] as RequestInit).headers).get('Idempotency-Key')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(readKey(1)).not.toBe(readKey(0))
    expect(order).toEqual(['send'])
  })

  it.each(['message', 'block answer'] as const)('starts a new execution when retrying a stored terminal error for a %s', async submission => {
    const stored = new Map<string, string>()
    let executions = 0
    const order: string[] = []
    mocks.queryClient.invalidateQueries.mockImplementation(() => { order.push('refetch'); return Promise.resolve() })
    mocks.fetch.mockImplementation(async (_url, options: RequestInit) => {
      const submittedKey = new Headers(options.headers).get('Idempotency-Key')!
      if (!stored.has(submittedKey)) {
        executions += 1
        stored.set(submittedKey, executions === 1
          ? frame('{"type":"error","status":503,"error":"Reply failed"}')
          : finalFrame(makeChatResponse({ aiMessage: 'Recovered reply.' })))
      }
      order.push('send')
      return sseResponse(stored.get(submittedKey)!)
    })
    const { result: composer } = renderHook(() => useChatComposer())
    const request = { kind: 'choice' as const, answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: ['Evening'] }
    await act(async () => {
      if (submission === 'message') await composer.current.sendMessage('Plan my morning')
      else expect(await composer.current.blockAnswerInteraction.send(request)).toEqual({ ok: false, status: 503 })
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    await act(async () => {
      if (submission === 'message') await composer.current.retryLastSend()
      else expect(await composer.current.blockAnswerInteraction.send(request)).toEqual({ ok: true })
    })
    expect(executions).toBe(2)
    const readKey = (index: number) => new Headers((mocks.fetch.mock.calls[index]?.[1] as RequestInit).headers).get('Idempotency-Key')
    expect(readKey(1)).not.toBe(readKey(0))
    expect(order.slice(0, 12)).toEqual(['send', ...Array.from({ length: 10 }, () => 'refetch'), 'send'])
    expect(useChatStore.getState().messages.filter(message => message.role === 'user')).toHaveLength(1)
    expect(useChatStore.getState().messages.some(message => message.content === 'Recovered reply.')).toBe(true)
  })

  it.each([
    ['message', 'message'], ['message', 'block answer'],
    ['block answer', 'message'], ['block answer', 'block answer'],
  ] as const)('holds the account reconciliation fence from %s through a fresh %s', async (initial, next) => {
    mocks.fetch.mockResolvedValueOnce(sseResponse(frame('{"type":"error","status":503,"error":"Interrupted","code":"CHAT_TURN_INTERRUPTED"}')))
    mocks.queryClient.invalidateQueries.mockRejectedValue(new Error('Refetch unavailable'))
    const { result: composer } = renderHook(() => useChatComposer())
    const request = { kind: 'choice' as const, answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: ['Evening'] }
    await act(async () => {
      if (initial === 'message') await composer.current.sendMessage('Plan my morning')
      else await composer.current.blockAnswerInteraction.send(request)
    })
    mocks.fetch.mockImplementation(async () => sseResponse(finalFrame(makeChatResponse())))
    const submit = async () => {
      if (next === 'message') await composer.current.sendMessage('A fresh message')
      else await composer.current.blockAnswerInteraction.send({ ...request, answer: { ...request.answer, selectedIds: ['morning'] }, labels: ['Morning'] })
    }
    await act(submit)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(20)
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
    await act(submit)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.queryClient.invalidateQueries.mock.calls.filter(([filters]) => filters?.refetchType === 'all')).toHaveLength(30)
    await act(async () => { await composer.current.sendMessage('After reconciliation') })
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(mocks.queryClient.invalidateQueries.mock.calls.filter(([filters]) => filters?.refetchType === 'all')).toHaveLength(30)
  })


  it('clears pending reconciliation when the account is replaced', async () => {
    mocks.fetch.mockResolvedValueOnce(sseResponse(frame('{"type":"error","status":503,"error":"Interrupted","code":"CHAT_TURN_INTERRUPTED"}')))
    mocks.queryClient.invalidateQueries.mockRejectedValue(new Error('Refetch unavailable'))
    const { result: composer } = renderHook(() => useChatComposer())
    await act(async () => { await composer.current.sendMessage('Original account') })
    await act(async () => { signInAs('replacement-account') })
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    await act(async () => { await composer.current.sendMessage('Replacement account') })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(10)
  })

  it('resends a dropped turn with the same key and payload and replaces one reply', async () => {
    const replay = controlledSseResponse()
    mocks.fetch.mockResolvedValueOnce(sseResponse(frame('{"type":"started","turnId":"fe4a8c19-9c97-481a-882d-ed7dea936ec0","state":"running","replayed":false}'), frame('{"type":"delta","text":"Partial"}')))
      .mockResolvedValueOnce(replay.response)
    const { result } = renderHook(() => useChatComposer())
    let sending!: Promise<void>
    act(() => { sending = result.current.sendMessage('Plan my morning') })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
    const draft = useChatStore.getState().messages.find(message => message.role === 'ai')
    expect(draft?.content).toBe('Partial')
    await act(async () => {
      replay.enqueue(frame('{"type":"started","turnId":"fe4a8c19-9c97-481a-882d-ed7dea936ec0","state":"completed","replayed":true}'))
      replay.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Recovered' })))
      replay.close()
      await sending
    })
    expect(useChatStore.getState().messages.find(message => message.role === 'ai')?.id).toBe(draft?.id)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    const first = mocks.fetch.mock.calls[0]![1] as RequestInit
    const second = mocks.fetch.mock.calls[1]![1] as RequestInit
    const key = new Headers(first.headers).get('Idempotency-Key')
    expect(key).toBeTruthy()
    expect(new Headers(second.headers).get('Idempotency-Key')).toBe(key)
    expect(second.body).toBe(first.body)
    expect(useChatStore.getState().messages.filter(message => message.role === 'ai')).toEqual([
      expect.objectContaining({ content: 'Recovered' }),
    ])
  })

  it.each(['text', 'tool', 'error', 'block', 'cancel', 'limit', 'limit-notice'])('replaces the pending reply indicator on %s', async (arrival) => {
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const { container, rerender } = render(<ComposerConversationHarness />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Plan my morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))
    onTestFinished(() => { if (arrival !== 'cancel') stream.close() })
    expect(container.querySelector('[data-astra-pending]')).not.toBeNull()
    expect(screen.getByRole('feed')).toHaveAttribute('aria-busy', 'true')
    await act(async () => {
      if (arrival === 'limit-notice') {
        mocks.state.profile = createMockProfile({ hasProAccess: false, aiMessagesUsed: 5, aiMessagesLimit: 5 })
        rerender(<ComposerConversationHarness />)
      }
      if (arrival === 'text') stream.enqueue(frame('{"type":"delta","text":"Start with water"}'))
      if (arrival === 'tool') stream.enqueue(frame('{"type":"step","domain":"habits","access":"read"}'))
      if (arrival === 'error') stream.enqueue(frame('{"type":"error","error":"Could not reply","status":500}'))
      if (arrival === 'limit') stream.enqueue(frame('{"type":"error","error":"Limit reached","status":403}'))
      if (arrival === 'block') stream.enqueue(finalFrame(makeChatResponse({ aiMessage: '', habitList: { scope: 'today', items: [] } })))
      if (arrival === 'cancel') stream.fail(new DOMException('Cancelled', 'AbortError'))
    })
    await waitFor(() => expect(container.querySelector('[data-astra-pending]') === null).toBe(arrival !== 'text'))
    if (arrival === 'text') expect(screen.queryByText('Start with water')).not.toBeInTheDocument()
    if (arrival === 'tool') expect(screen.getByText('chat.trace.habits.read')).toBeVisible()
  })

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
    expect(screen.queryByText('Start with water')).not.toBeInTheDocument()
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
    expect(screen.getByRole('feed', { name: 'chat.title' })).not.toHaveAttribute('aria-live')
    await act(async () => { stream.enqueue(finalFrame(makeChatResponse())); stream.close() })
    expect(screen.getByText('Hi there', { selector: '[data-bubble-role="ai"] p' })).toBeVisible()
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
    await waitFor(() => expect(screen.getByText('Hi there', { selector: '[data-bubble-role="ai"] p' })).toBeVisible())
  })

  it('keeps voice failures visible in the dock without opening the conversation or losing the draft', () => {
    useChatStore.setState({ draft: 'Keep my draft', draftHydrated: true })
    const view = render(<ComposerConversationHarness />)
    mocks.state.speechError = 'microphone denied'
    view.rerender(<ComposerConversationHarness />)
    expect(screen.getByRole('alert')).toHaveTextContent('microphone denied')
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
    expect(screen.getByRole('textbox')).toHaveValue('Keep my draft')
    view.rerender(<ComposerConversationHarness />)
    expect(screen.getByRole('alert')).toHaveTextContent('microphone denied')
    mocks.state.speechError = null
    mocks.state.isRecording = true
    view.rerender(<ComposerConversationHarness />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'shell.composer.voice.stop' })).toBeEnabled()
    mocks.state.isRecording = false
    mocks.state.isTranscribing = true
    view.rerender(<ComposerConversationHarness />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    mocks.state.isTranscribing = false
    mocks.state.transcript = 'Voice recovered'
    view.rerender(<ComposerConversationHarness />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Keep my draft Voice recovered')
  })

  it.each(['transport', 'attachment'] as const)('preserves a %s error through speech denial and recovery', async (producer) => {
    const { result, rerender } = renderHook(() => useChatComposer())
    if (producer === 'transport') {
      mocks.fetch.mockRejectedValueOnce(new Error('network unavailable'))
      await act(async () => { await result.current.sendMessage('Plan my morning') })
    } else {
      await act(async () => { await result.current.handleTextFileSelect(fileChangeEvent(textFile('notes.txt', '', 21 * 1024 * 1024))) })
    }
    const originalError = result.current.composerProps.errorMessage
    expect(originalError).toBeTruthy()
    mocks.state.speechError = 'microphone denied'
    rerender()
    expect(result.current.composerProps.errorMessage).toBe('microphone denied')
    mocks.state.speechError = null
    mocks.state.isRecording = true
    rerender()
    expect(result.current.composerProps.errorMessage).toBe(originalError)
    mocks.state.isRecording = false
    mocks.state.transcript = 'Voice recovered'
    rerender()
    expect(result.current.composerProps.errorMessage).toBe(originalError)
  })

  it('offers one retry action in the owning conversation after a transport failure', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('network unavailable')).mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    render(<ComposerConversationHarness />)
    const draft = '  Plan my morning\n  '
    fireEvent.change(screen.getByRole('textbox'), { target: { value: draft } })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('chat.sendError'))
    expect(screen.getByRole('textbox')).toHaveValue(draft)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    const retries = screen.getAllByRole('button', { name: 'shell.composer.retry' })
    expect(retries).toHaveLength(1)
    expect(retries[0]!.closest('[data-composer-root]')).not.toBeNull()
    fireEvent.click(retries[0]!)
    await waitFor(() => expect(screen.getByText('Hi there', { selector: '[data-bubble-role="ai"] p' })).toBeVisible())
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'shell.composer.retry' })).not.toBeInTheDocument()
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

  it.each(['en', 'pt-BR'] as const)('shows one daily boundary with its renewal in %s', (locale) => {
    mocks.locale = locale
    const messages = locale === 'en' ? en : ptBR
    mocks.translate = createTranslator({ locale, messages })
    mocks.state.profile = createMockProfile({ aiMessagesUsed: 5, aiMessagesLimit: 5 })
    const { result } = renderHook(() => useChatComposer())
    render(<Composer {...result.current.composerProps} />)
    const notice = messages.shell.composer.limit.reason.replace('{allowance}', '5')
    expect(screen.getAllByText(notice)).toHaveLength(1)
    expect(notice).not.toContain(locale === 'en' ? 'midnight' : 'meia-noite')
    expect(screen.getAllByText(messages.shell.composer.limit.renewal)).toHaveLength(1)
    expect(screen.queryByText(mocks.translate('shell.composer.usage', { used: 5, limit: 5 }))).not.toBeInTheDocument()
    expect(screen.queryByText(messages.shell.composer.limit.exhausted)).not.toBeInTheDocument()
  })

  it.each([[0, 5, false], [2, 5, false], [3, 5, true], [4, 5, true], [5, 5, false], [47, 50, false], [48, 50, true], [49, 50, true], [50, 50, false]] as const)('shows the daily counter at %i of %i only near capacity', (used, limit, visible) => {
    mocks.state.profile = createMockProfile({ aiMessagesUsed: used, aiMessagesLimit: limit })
    const { result } = renderHook(() => useChatComposer())
    expect(Boolean(result.current.composerProps.usageMessage)).toBe(visible)
    if (visible) expect(result.current.composerProps.usageMessage).toContain('shell.composer.usage')
    expect(Boolean(result.current.composerProps.renewalHint)).toBe(visible || used === limit)
    if (used === limit) {
      expect(result.current.composerProps.state).toBe('atLimit')
      expect(result.current.composerProps.suggestions).toHaveLength(0)
    }
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
    mocks.translate = undefined
    mocks.locale = 'en'
    HTMLElement.prototype.scrollTo = vi.fn()
    useThrottleStore.getState().clear()
    mocks.state.profile = undefined
    mocks.searchParams = ''
    mocks.state.habitData = { topLevelHabits: [], totalCount: 0 }
    mocks.state.detail = null
    mocks.state.habitFilters = []
    mocks.state.habitsError = false
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
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })

  afterEach(() => {
    useThrottleStore.getState().clear()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })


  it.each(['final only', 'streamed text'].flatMap(transport => [
    { transport, scenario: 'moderated decline', consumed: false, reply: 'I cannot help with that request.' },
    { transport, scenario: 'crisis support', consumed: false, reply: 'You deserve support. Reach out to someone you trust.' },
    { transport, scenario: 'ordinary reply', consumed: true, reply: 'Start with a glass of water.' },
    { transport, scenario: 'legacy reply', consumed: undefined, reply: 'Start with a glass of water.' },
    { transport, scenario: 'nullable allowance', consumed: null, reply: 'Start with a glass of water.' },
  ]))('preserves the last message allowance for $scenario with $transport', async ({ transport, consumed, reply }) => {
    const { QueryClient } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
    const cache = new QueryClient()
    onTestFinished(() => { cache.clear(); mocks.queryClient.setQueryData.mockReset() })
    mocks.state.profile = createMockProfile({ aiMessagesUsed: 4, aiMessagesLimit: 5 })
    cache.setQueryData(profileKeys.detail(), mocks.state.profile)
    mocks.queryClient.setQueryData.mockImplementation(cache.setQueryData.bind(cache))
    const response = { ...makeChatResponse({ aiMessage: reply }), ...(consumed === undefined ? {} : { messageAllowanceConsumed: consumed }) }
    mocks.fetch.mockResolvedValueOnce(sseResponse(
      ...(transport === 'streamed text' ? [frame(JSON.stringify({ type: 'delta', text: reply }))] : []),
      finalFrame(response),
    ))
    const { result, rerender } = renderHook(() => useChatComposer())
    const initialUsageMessage = result.current.composerProps.usageMessage
    await act(async () => { await result.current.sendMessage('Help me with this') })
    mocks.state.profile = cache.getQueryData<Profile>(profileKeys.detail())
    await act(async () => { rerender(); await Promise.resolve() })
    const charged = consumed !== false
    expect(result.current.aiMessagesUsed).toBe(charged ? 5 : 4)
    expect(result.current.atMessageLimit).toBe(charged)
    expect(result.current.composerProps.state).toBe(charged ? 'atLimit' : 'idle')
    expect(result.current.composerProps.usageMessage).toBe(charged ? undefined : initialUsageMessage)
    expect(useChatStore.getState().messages.filter(message => message.role === 'ai').map(message => message.content)).toEqual([reply])
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    await act(async () => { await result.current.sendMessage('Help me plan a walk') })
    expect(mocks.fetch).toHaveBeenCalledTimes(charged ? 1 : 2)
    expect(cache.getQueryData<Profile>(profileKeys.detail())?.aiMessagesUsed).toBe(5)
  })

  it('sends a localized block answer once and retains the preview in the existing message path', async () => {
    mocks.locale = 'pt-BR'
    mocks.state.profile = createMockProfile({ aiMessagesUsed: 5, aiMessagesLimit: 5 })
    mocks.fetch.mockResolvedValue(sseResponse(`data: ${JSON.stringify({ type: 'final', response: { aiMessage: 'Nothing has been saved.', actions: [], pendingOperations: makeHeldHabitMessage().pendingOperations } })}\n\n`))
    const { result } = renderHook(() => useChatComposer())
    const request = { kind: 'pickList' as const, answer: { blockId: pickListBlockFixture.blockId, selectedIds: ['1', '3'] }, labels: ['Caminhar', 'Ler'] }
    await act(async () => {
      const answers = await Promise.all([result.current.blockAnswerInteraction.send(request), result.current.blockAnswerInteraction.send(request)])
      expect(answers).toEqual([{ ok: true }, { ok: false, status: null }])
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    const body = mocks.fetch.mock.calls[0]![1].body as FormData
    expect(JSON.parse(body.get('blockAnswer') as string)).toEqual(request.answer)
    expect(body.get('message')).toBe('Caminhar e Ler')
    expect(JSON.parse(body.get('clientContext') as string).partKinds).toEqual(expect.arrayContaining(['choice', 'pickList']))
    expect(useChatStore.getState().messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Caminhar e Ler'])
    expect(useChatStore.getState().messages.at(-1)?.pendingOperations).toEqual(makeHeldHabitMessage().pendingOperations)
  })

  it.each(['reply failure', 'lost final response', 'conflicting retry'] as const)('retries the same block answer after %s and keeps one selected-label summary', async scenario => {
    useChatStore.setState({ messages: [makeHeldHabitMessage({ id: 'question', content: '', pendingOperations: [], parts: [{ type: 'block', kind: 'choice', block: choiceBlockFixture }] })] })
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValueOnce(stream.response)
    if (scenario === 'lost final response') mocks.fetch.mockRejectedValueOnce(new Error('Replay disconnected'))
    function Harness() { const chat = useChatComposer(); return <AstraConversation chat={chat} /> }
    render(<Harness />)
    fireEvent.click(screen.getAllByRole('radio')[2]!)
    fireEvent.change(screen.getByLabelText('freeText'), { target: { value: 'After work' } })
    fireEvent.click(screen.getByRole('button', { name: 'submit' }))
    await waitFor(() => expect(useChatStore.getState().messages.some(message => message.role === 'user')).toBe(true))
    await act(async () => {
      stream.enqueue(frame('{"type":"delta","text":"Preparing"}'))
      if (scenario !== 'lost final response') stream.enqueue(frame('{"type":"error","error":"Reply failed","status":500}'))
      stream.close()
    })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('error'))
    expect(screen.getAllByRole('radio')[2]).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText('closed')).not.toBeInTheDocument()
    const replyText = scenario === 'lost final response' ? 'Stored reply.' : 'Retried reply.'
    const reply = makeChatResponse({ aiMessage: replyText })
    const completedKey = new Headers((mocks.fetch.mock.calls[0]?.[1] as RequestInit).headers).get('Idempotency-Key')
    mocks.fetch.mockImplementationOnce(async (_url, options: RequestInit) => {
      if (scenario !== 'lost final response' && new Headers(options.headers).get('Idempotency-Key') === completedKey) return sseResponse(frame('{"type":"error","error":"Reply failed","status":500}'))
      return scenario === 'conflicting retry'
        ? Response.json({ error: 'Already answered', errorCode: 'AstraBlockAnswered' }, { status: 409 })
        : sseResponse(finalFrame(reply))
    })
    await act(async () => {
      const submit = screen.getByRole('button', { name: 'submit' })
      fireEvent.click(submit); fireEvent.click(submit)
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(scenario === 'lost final response' ? 3 : 2)
    const userMessages = useChatStore.getState().messages.filter(message => message.role === 'user')
    expect(userMessages.map(message => message.content)).toEqual([new Intl.ListFormat('en', { type: 'conjunction' }).format([choiceBlockFixture.options[2]!.label, 'After work'])])
    expect(userMessages[0]?.answerToBlockId).toBe(choiceBlockFixture.blockId)
    const answers = mocks.fetch.mock.calls.map(([, options]) => JSON.parse((options.body as FormData).get('blockAnswer') as string))
    expect(answers).toEqual(Array.from({ length: scenario === 'lost final response' ? 3 : 2 }, () => ({ blockId: choiceBlockFixture.blockId, selectedIds: ['evening'], freeText: 'After work' })))
    if (scenario === 'conflicting retry') {
      expect(screen.getByText('chat.choice.alreadyAnswered')).toBeInTheDocument()
      expect(screen.queryByText(/chat.choice.answered/)).not.toBeInTheDocument()
      expect(screen.queryByText('Stored reply.')).not.toBeInTheDocument()
    } else {
      expect(screen.getByText(/chat.choice.answered/)).toBeInTheDocument()
      expect(screen.getByText(replyText, { selector: 'p' })).toBeInTheDocument()
    }
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    if (scenario !== 'conflicting retry') expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })

  it.each([
    { scenario: 'lost final at the limit', initial: 4, refreshed: 5, authoritative: 5 },
    { scenario: 'stored replay after a profile refresh', initial: 3, refreshed: 4, authoritative: 4 },
    { scenario: 'refunded failure with a new reservation', initial: 3, refreshed: 3, authoritative: 4 },
  ])('reconciles recovery usage for $scenario', async ({ scenario, initial, refreshed, authoritative }) => {
    const { QueryClient, QueryObserver } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let serverUsage = initial
    const profileQuery = { queryKey: profileKeys.detail(), queryFn: () => Promise.resolve(createMockProfile({ aiMessagesUsed: serverUsage, aiMessagesLimit: 5 })) }
    const observer = new QueryObserver(cache, profileQuery)
    const unsubscribe = observer.subscribe(() => {})
    onTestFinished(() => { unsubscribe(); cache.clear(); mocks.queryClient.setQueryData.mockReset() })
    mocks.queryClient.setQueryData.mockImplementation(cache.setQueryData.bind(cache))
    mocks.queryClient.invalidateQueries.mockImplementation(cache.invalidateQueries.bind(cache))
    mocks.state.profile = await cache.fetchQuery(profileQuery)
    mocks.fetch.mockResolvedValueOnce(scenario === 'refunded failure with a new reservation'
      ? Response.json({ error: 'Reply failed' }, { status: 500 })
      : sseResponse(frame('{"type":"started"}')))
    mocks.fetch.mockRejectedValueOnce(new Error('Replay disconnected'))
    const { result, rerender } = renderHook(() => useChatComposer())
    const request = { kind: 'choice' as const, answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'], freeText: 'After work' }, labels: ['Evening'] }
    await act(async () => { expect(await result.current.blockAnswerInteraction.send(request)).toMatchObject({ ok: false }) })
    serverUsage = refreshed
    mocks.state.profile = await cache.fetchQuery(profileQuery)
    await act(async () => { rerender(); await Promise.resolve() })
    expect(result.current.atMessageLimit).toBe(refreshed === 5)
    serverUsage = authoritative
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse({ aiMessage: 'Recovered reply.' }))))
    await act(async () => { expect(await result.current.blockAnswerInteraction.send(request)).toEqual({ ok: true }) })
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(cache.getQueryData<Profile>(profileKeys.detail())?.aiMessagesUsed).toBe(authoritative)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
    expect(useChatStore.getState().messages.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it('blocks a changed recovery answer at the limit', async () => {
    mocks.state.profile = createMockProfile({ aiMessagesUsed: 4, aiMessagesLimit: 5 })
    mocks.fetch.mockResolvedValueOnce(sseResponse(frame('{"type":"started"}')))
    const { result, rerender } = renderHook(() => useChatComposer())
    const request = { kind: 'choice' as const, answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: ['Evening'] }
    await act(async () => { await result.current.blockAnswerInteraction.send(request) })
    mocks.state.profile = createMockProfile({ aiMessagesUsed: 5, aiMessagesLimit: 5 })
    await act(async () => { rerender(); await Promise.resolve() })
    await act(async () => { expect(await result.current.blockAnswerInteraction.send({ ...request, answer: { ...request.answer, selectedIds: ['morning'] } })).toEqual({ ok: false, status: null }) })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps the answered summary after the thread remounts', async () => {
    useChatStore.setState({ messages: [makeHeldHabitMessage({ content: '', pendingOperations: [], parts: [{ type: 'block', kind: 'choice', block: choiceBlockFixture }] })] })
    mocks.fetch.mockResolvedValue(sseResponse(`data: ${JSON.stringify({ type: 'final', response: { aiMessage: 'Continue.', actions: [] } })}\n\n`))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.blockAnswerInteraction.send({ kind: 'choice', answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: ['Evening'] }) })
    const view = render(<AstraConversation chat={result.current} />)
    expect(screen.getByText('chat.choice.answered:{"options":"Evening"}')).toBeInTheDocument()
    view.unmount()
    render(<AstraConversation chat={result.current} />)
    expect(screen.getByText('chat.choice.answered:{"options":"Evening"}')).toBeInTheDocument()
  })

  it.each([400, 404, 409, 410])('returns block status %s without inserting a later turn or a global retry', async status => {
    mocks.fetch.mockResolvedValue(Response.json({ error: 'Invalid answer' }, { status }))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => {
      expect(await result.current.blockAnswerInteraction.send({ kind: 'choice', answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: ['Evening'] })).toEqual({ ok: false, status })
    })
    expect(useChatStore.getState().messages).toEqual([])
    expect(result.current.canRetryLastSend).toBe(false)
    expect(result.current.sendError).toBeNull()
  })

  it('blocks a choice answer at quota and any answer while offline', async () => {
    mocks.state.profile = createMockProfile({ aiMessagesUsed: 5, aiMessagesLimit: 5 })
    const { result } = renderHook(() => useChatComposer())
    const request = { kind: 'choice' as const, answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: ['Evening'] }
    await act(async () => { expect(await result.current.blockAnswerInteraction.send(request)).toEqual({ ok: false, status: null }) })
    const network = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    onTestFinished(() => network.mockRestore())
    await act(async () => { globalThis.dispatchEvent(new Event('offline')) })
    await act(async () => { expect(await result.current.blockAnswerInteraction.send({ ...request, kind: 'pickList' })).toEqual({ ok: false, status: null }) })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('reveals streaming text before coalesced final blocks can move the reply below the viewport', async () => {
    vi.useFakeTimers()
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValueOnce(stream.response)
    const { result } = renderHook(() => useChatComposer())
    const view = render(<AstraConversation chat={result.current} />)
    const feed = screen.getByRole('feed')
    Object.defineProperty(feed, 'scrollHeight', { get: () => useChatStore.getState().streamingMessageId ? 1400 : 3000 })
    Object.defineProperty(feed, 'clientHeight', { value: 500 })
    feed.scrollTop = 900
    fireEvent.scroll(feed)
    let sending!: Promise<void>
    await act(async () => { sending = result.current.sendMessage('hello'); await vi.advanceTimersByTimeAsync(100) })
    vi.mocked(feed.scrollTo).mockClear()
    await act(async () => {
      stream.enqueue(frame(JSON.stringify({ type: 'delta', text: partsFixture.response.aiMessage })) + finalFrame(chatResponseSchema.parse(partsFixture.response)))
      stream.close()
      await vi.advanceTimersByTimeAsync(100)
      await sending
    })
    view.rerender(<AstraConversation chat={result.current} />)
    expect(feed.scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: 'smooth' })
    expect(feed.scrollTo).not.toHaveBeenCalledWith({ top: 3000, behavior: 'smooth' })
    expect(feed.querySelectorAll('section[data-state]')).toHaveLength(2)
    expect(result.current.threadScroll.isFollowing()).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(feed.scrollTo).not.toHaveBeenCalledWith({ top: 3000, behavior: 'smooth' })
    view.unmount()
  })

  it('holds the reading position when ordered final parts replace streaming text, including resize callbacks', async () => {
    vi.useFakeTimers()
    const resized: (() => void)[] = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized.push(callback) }
      observe() {}
      disconnect() {}
    })
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValueOnce(stream.response)
    const { result } = renderHook(() => useChatComposer())
    const view = render(<AstraConversation chat={result.current} />)
    const feed = screen.getByRole('feed')
    Object.defineProperty(feed, 'scrollHeight', { value: 1400, configurable: true })
    Object.defineProperty(feed, 'clientHeight', { value: 500 })
    feed.scrollTop = 900
    fireEvent.scroll(feed)
    let sending!: Promise<void>
    await act(async () => { sending = result.current.sendMessage('hello'); await Promise.resolve() })
    await act(async () => {
      stream.enqueue(frame(JSON.stringify({ type: 'delta', text: partsFixture.response.aiMessage })))
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(feed.scrollTo).toHaveBeenCalled()
    vi.mocked(feed.scrollTo).mockClear()
    Object.defineProperty(feed, 'scrollHeight', { value: 2000, configurable: true })
    await act(async () => {
      stream.enqueue(finalFrame(chatResponseSchema.parse(partsFixture.response)))
      stream.close()
      await sending
    })
    view.rerender(<AstraConversation chat={result.current} />)
    await act(async () => { resized.forEach(callback => callback()); await vi.advanceTimersByTimeAsync(100) })
    expect(feed.scrollTo).not.toHaveBeenCalled()
    expect(feed.scrollTop).toBe(900)
    expect(feed.getAttribute('aria-busy')).toBe('false')
    expect(feed.querySelectorAll('section[data-state]')).toHaveLength(2)
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    await act(async () => { await result.current.sendMessage('another question'); await vi.advanceTimersByTimeAsync(100) })
    expect(feed.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' })
    view.unmount()
  })

  it('leaves earlier messages in place when a queued send and later stream reply settle, then resumes on another send', async () => {
    vi.useFakeTimers()
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValueOnce(stream.response)
    const { result } = renderHook(() => useChatComposer())
    const view = render(<AstraConversation chat={result.current} />)
    const feed = screen.getByRole('feed')
    Object.defineProperty(feed, 'scrollHeight', { value: 1400 })
    Object.defineProperty(feed, 'clientHeight', { value: 500 })
    feed.scrollTop = 900
    fireEvent.scroll(feed)
    let sending!: Promise<void>
    await act(async () => { sending = result.current.sendMessage('hello'); await Promise.resolve() })
    feed.scrollTop = 100
    fireEvent.scroll(feed)
    vi.mocked(feed.scrollTo).mockClear()
    await act(async () => {
      stream.enqueue(frame('{"type":"delta","text":"A reply"}'))
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(feed.scrollTo).not.toHaveBeenCalled()
    await act(async () => {
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
      await sending
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(feed.scrollTo).not.toHaveBeenCalled()
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    await act(async () => { await result.current.sendMessage('another question'); await vi.advanceTimersByTimeAsync(100) })
    expect(feed.scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: 'smooth' })
    view.unmount()
  })

  it.each([
    [true, 'auto'],
    [false, 'smooth'],
  ] as const)('scrolls sent messages with reduced motion %s using %s', async (reducedMotion, behavior) => {
    vi.useFakeTimers()
    let prefersReducedMotion = reducedMotion
    const originalMatchMedia = window.matchMedia.bind(window)
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      ...originalMatchMedia(query),
      matches: query === '(prefers-reduced-motion: reduce)' && prefersReducedMotion,
    }))
    onTestFinished(() => matchMedia.mockRestore())
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    const container = document.createElement('div')
    Object.defineProperty(container, 'scrollHeight', { value: 640 })
    result.current.chatContainerRef.current = container

    await act(async () => { await result.current.sendMessage('hello') })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 640, behavior })
    expect(container.scrollTo).not.toHaveBeenCalledWith({
      top: 640, behavior: reducedMotion ? 'smooth' : 'auto',
    })
    vi.mocked(container.scrollTo).mockClear()
    prefersReducedMotion = !reducedMotion
    await act(async () => { await result.current.sendMessage('hello again') })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 640, behavior: reducedMotion ? 'smooth' : 'auto',
    })
    expect(container.scrollTo).not.toHaveBeenCalledWith({ top: 640, behavior })
  })

  it('sends the account held when chat intent formed', async () => {
    signInAs('account-a')
    mocks.fetch.mockResolvedValue(new Response('{"error":"failed"}', { status: 500 }))
    const { result } = renderHook(() => useChatComposer())

    await act(async () => { await result.current.sendMessage('hello') })

    expect(new Headers(mocks.fetch.mock.calls[0]?.[1]?.headers).get('X-Orbit-Held-Account-Id')).toBe('account-a')
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

  it('blocks release reloads through confirmation, execution and result invalidation', async () => {
    let confirm!: (value: Awaited<ReturnType<typeof confirmPendingOperation>>) => void
    let execute!: (value: Awaited<ReturnType<typeof executePendingOperation>>) => void
    let invalidate!: () => void
    vi.mocked(confirmPendingOperation).mockImplementationOnce(() => new Promise(resolve => { confirm = resolve }))
    vi.mocked(executePendingOperation).mockImplementationOnce(() => new Promise(resolve => { execute = resolve }))
    mocks.queryClient.invalidateQueries.mockImplementationOnce(() => new Promise<void>(resolve => { invalidate = resolve }))
    const { result, unmount } = renderHook(() => useChatComposer())
    expect(canReloadDesktopWeb()).toBe(true)
    let pending!: ReturnType<typeof result.current.confirmAndExecutePendingOperation>
    await act(async () => { pending = result.current.confirmAndExecutePendingOperation('pending-1') })
    expect(result.current.isPendingOperationBusy).toBe(true)
    expect(canReloadDesktopWeb()).toBe(false)
    await act(async () => { confirm({ ok: true, data: { pendingOperationId: 'pending-1', confirmationToken: 'token-1', expiresAtUtc: '2026-09-29T12:00:00Z' } }) })
    expect(canReloadDesktopWeb()).toBe(false)
    await act(async () => { execute({ ok: true, data: { operation: {
      operationId: 'operation-1', sourceName: 'CreateHabit', riskClass: 'Low', confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created',
    } } }) })
    expect(canReloadDesktopWeb()).toBe(false)
    await act(async () => { invalidate(); await pending })
    expect(result.current.isPendingOperationBusy).toBe(false)
    expect(canReloadDesktopWeb()).toBe(true)
    unmount()
    expect(canReloadDesktopWeb()).toBe(true)
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

  it.each(['new', 'reopened'])('serializes the full %s proactive item in the next typed follow-up over ten prior messages', async (entry) => {
    const item = createMockProactiveItem({ text: 'Try a short walk after lunch. Keep it comfortable and stop if you need a break.' })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    act(() => {
      if (entry === 'reopened') useChatStore.getState().openProactiveItem(item)
      for (let index = 0; index < 10; index += 1) {
        useChatStore.getState().addMessage({ id: `previous-${index}`, role: index % 2 === 0 ? 'user' : 'ai', content: `Earlier turn ${index}`, timestamp: new Date() })
      }
      result.current.setInput('Why do you suggest that?')
      useChatStore.getState().openProactiveItem(item)
      useUIStore.getState().setAstraConversationOpen(true)
    })
    expect(result.current.input).toBe('Why do you suggest that?')
    expect(useChatStore.getState().messages[0]).toMatchObject({ proactiveItem: item, content: item.text })
    expect(useChatStore.getState().messages.slice(1).map(message => message.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `previous-${index}`),
    )

    await act(async () => { result.current.composerProps.onSend(); await Promise.resolve() })
    await vi.waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Hi there'))

    const formData = mocks.fetch.mock.calls[0]![1].body as FormData
    const history = JSON.parse(formData.get('history') as string)
    expect(formData.get('message')).toBe('Why do you suggest that?')
    expect(history).toContainEqual({ role: 'assistant', content: item.text })
    expect(history.filter((message: { content: string }) => message.content === item.text)).toHaveLength(1)
    expect(history).toHaveLength(10)
    expect(history).toEqual([
      ...Array.from({ length: 9 }, (_, index) => ({
        role: index % 2 === 0 ? 'assistant' : 'user', content: `Earlier turn ${index + 1}`,
      })),
      { role: 'assistant', content: item.text },
    ])

    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    await act(async () => { await result.current.sendMessage('What else can I try?') })
    const nextFormData = mocks.fetch.mock.calls[1]![1].body as FormData
    const nextHistory = JSON.parse(nextFormData.get('history') as string)
    expect(nextHistory).toHaveLength(10)
    expect(nextHistory).not.toContainEqual({ role: 'assistant', content: item.text })
  })

  it('keeps an opened daily summary in the next request after ten prior messages', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    act(() => {
      for (let index = 0; index < 10; index += 1) {
        useChatStore.getState().addMessage({ id: `previous-${index}`, role: index % 2 === 0 ? 'user' : 'ai', content: `Earlier turn ${index}`, timestamp: new Date() })
      }
      useChatStore.getState().openDailySummary('2026-09-12', 'Try a short walk after lunch. Keep it comfortable.')
      useUIStore.getState().setAstraConversationOpen(true)
    })

    await act(async () => { await result.current.sendMessage('How should I do that?') })

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    const [, request] = mocks.fetch.mock.calls[0]!
    const formData = request.body as FormData
    const history = JSON.parse(formData.get('history') as string)
    expect(history).toHaveLength(10)
    expect(history.at(-1)).toEqual({ role: 'assistant', content: 'Try a short walk after lunch. Keep it comfortable.' })
    expect(formData.get('message')).toBe('How should I do that?')
  })

  it('sends Support entry intent on the first and later requests of that conversation', async () => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer())
    useUIStore.getState().setAstraConversationOpen(true, 'support')

    await act(async () => { await result.current.sendMessage('my streak reset') })
    await act(async () => { await result.current.sendMessage('can you help?') })

    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    for (const [, request] of mocks.fetch.mock.calls) {
      const context = JSON.parse((request.body as FormData).get('clientContext') as string)
      expect(context.entryPointIntent).toBe('support')
    }
  })

  it.each([
    ['/', 'open', undefined],
    ['/', 'direct-send', undefined],
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

  it.each(['pending', 'step', 'delta'] as const)('keeps a newer stream active when the finalized request finishes invalidating (%s)', async phase => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockImplementation(filters => filters?.refetchType === 'all' ? Promise.resolve() : invalidations)
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
      if (phase === 'delta') secondStream.enqueue(frame('{"type":"delta","text":"Still [[or"}'))
      if (phase === 'step') secondStream.enqueue(frame('{"type":"step","domain":"habits","access":"read"}'))
    })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
    if (phase === 'delta') await waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())
    if (phase === 'step') await waitFor(() => expect(result.current.activeSteps).toEqual([{ domain: 'habits', access: 'read' }]))
    expect(result.current.isSending).toBe(true)
    const secondDraftId = useChatStore.getState().streamingMessageId

    await act(async () => {
      resolveInvalidations()
      await sendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBe(secondDraftId)
    expect(result.current.isSending).toBe(true)
    expect(result.current.isTyping).toBe(phase !== 'delta')
    if (phase === 'step') expect(result.current.activeSteps).toEqual([{ domain: 'habits', access: 'read' }])
    await act(async () => { await result.current.sendMessage('overlapping third request') })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)

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
      await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS * 2)
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
      content: 'chat.limitReachedError',
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

  it('keeps the authoritative allowance when a reply refreshes completed writes', async () => {
    mocks.state.profile = createMockProfile({ aiMessagesUsed: 4 })
    mocks.queryClient.setQueryData.mockImplementationOnce((_key, update: (profile: Profile) => Profile) => {
      mocks.state.profile = update(mocks.state.profile!)
    })
    mocks.queryClient.invalidateQueries.mockImplementation(() => {
      mocks.state.profile = createMockProfile({ aiMessagesUsed: 5 })
      return Promise.resolve()
    })
    const reply = makeChatResponse({ operations: [{
      operationId: 'operation-1', sourceName: 'CreateHabit', riskClass: 'Low', confirmationRequirement: 'None', status: 'Succeeded',
    }] })
    mocks.fetch.mockResolvedValueOnce(sseResponse(finalFrame(reply)))
    const { result } = renderHook(() => useChatComposer())
    await act(async () => { await result.current.sendMessage('log water') })
    expect(mocks.state.profile.aiMessagesUsed).toBe(5)
  })

  it('keeps a same-valued newer edit while a successful retry finishes invalidating', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockImplementation(filters => filters?.refetchType === 'all' ? Promise.resolve() : invalidations)
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
    mocks.queryClient.invalidateQueries.mockImplementation(filters => filters?.refetchType === 'all' ? Promise.resolve() : invalidations)
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
      content: 'chat.limitReachedError',
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
      content: 'chat.limitReachedError',
    })
    expect(result.current.sendError).toBeNull()
    expect(result.current.canRetryLastSend).toBe(false)
  })

  it.each([false, true])('submits a pasted image with fixed payload (resend: %s)', async resend => {
    const pastedImage = new File(['image'], 'pasted.jpg', { type: 'image/jpeg' })
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:pasted-image'),
      revokeObjectURL: vi.fn(),
    }))
    if (resend) mocks.fetch.mockRejectedValueOnce(new TypeError('Disconnected'))
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))

    function ComposerHarness() {
      const { composerProps } = useChatComposer()
      return <Composer {...composerProps} />
    }

    render(<ComposerHarness />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'shell.composer.inputLabel' }), {
      clipboardData: {
        items: [{ type: pastedImage.type, getAsFile: () => pastedImage }],
      },
    })

    expect(screen.getByRole('list', { name: 'shell.composer.attach.trayLabel' })).toBeInTheDocument()
    expect(screen.getByText('pasted.jpg')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'shell.composer.inputLabel' }), {
      target: { value: 'log my walk' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'shell.composer.send' }))

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(resend ? 2 : 1))
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('log my walk')
    expect(requestBody.get('image')).toBe(pastedImage)
    if (resend) expect(mocks.fetch.mock.calls[1]?.[1].body).toBe(requestBody)
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
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:selected-image'),
      revokeObjectURL: vi.fn(),
    }))
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
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:selected-image'),
      revokeObjectURL: vi.fn(),
    }))
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
      expect(result.current.composerProps.words.inputLabel).toBe('shell.composer.inputLabel')

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

  it.each([4, 5, 6])('shows the empty invitation only below the daily limit with %s messages used', (aiMessagesUsed) => {
    mocks.state.profile = createMockProfile({ aiMessagesUsed, aiMessagesLimit: 5 })
    const { result } = renderHook(() => useChatComposer())
    render(<AstraConversation chat={result.current} />)

    expect(result.current.messages).toEqual([])
    if (aiMessagesUsed < 5) {
      expect(screen.getByText('chat.empty.title')).toBeInTheDocument()
      expect(screen.getByText('aiDisclosure.notMedicalAdvice')).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'shell.composer.suggestionsLabel' })).toBeInTheDocument()
    } else {
      expect(screen.queryByText('chat.empty.title')).toBeNull()
      expect(screen.queryByRole('group', { name: 'shell.composer.suggestionsLabel' })).toBeNull()
      expect(screen.getAllByText('shell.composer.limit.reason:{"allowance":5}')).toHaveLength(1)
    }
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
      content: 'chat.limitReachedError',
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

  it('keeps an actionable speech permission error visible after its former timeout', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(() => useChatComposer())

    mocks.state.speechError = 'microphone denied'
    rerender()
    expect(result.current.composerProps.errorMessage).toBe('microphone denied')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(result.current.composerProps.errorMessage).toBe('microphone denied')
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
    expect(result.current.composerProps.words.placeholder).toBe('shell.composer.limit.placeholder')
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

  it.each(['/', '/habits/reading'])('places dock suggestions according to the owning route %s', (pathname) => {
    mocks.pathname = pathname
    mocks.state.profile = createMockProfile({ hasImportedCalendar: true, hasSeenImportPrompt: true })
    mocks.state.detail = makeHabitDetail()
    answerSessionWith({ expiresAt: Date.now() + 3600000, userId: 'user-1' })
    render(<AppLayout><div>Content</div></AppLayout>)
    expect(screen.getByRole('textbox')).toBeVisible()
    const group = screen.queryByRole('group', { name: 'shell.composer.suggestionsLabel' })
    if (pathname === '/') expect(group).not.toBeInTheDocument()
    else expect(group).toBeVisible()
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

  it.each([412, 1352])('keeps the focused Today chip when live habits and profile update at %spx', (width) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    mocks.state.profile = createMockProfile({ lastCompletionDate: null, currentStreak: 0 })
    const habit = createMockHabit({ title: 'Read', isCompleted: false, isOverdue: false, hasSubHabits: false })
    mocks.state.habitData = { topLevelHabits: [habit], totalCount: 1 }

    function TodayComposer() {
      const chat = useChatComposer({ pathname: '/', totalHabitCount: 1 })
      return <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="hoje" navLabel="Navigation" composer={<Composer {...chat.composerProps} />} />
    }

    const view = render(<TodayComposer />)
    const chip = screen.getByRole('button', { name: 'shell.composer.chips.today.logHabit' })
    act(() => chip.focus())
    expect(chip).toHaveFocus()

    mocks.state.habitData = { topLevelHabits: [{ ...habit }], totalCount: 1 }
    mocks.state.profile = { ...mocks.state.profile, aiMessagesUsed: 1 }
    view.rerender(<TodayComposer />)
    expect(screen.getByRole('button', { name: chip.getAttribute('aria-label')! })).toBe(chip)
    expect(chip).toHaveFocus()

    mocks.state.habitData = {
      topLevelHabits: [createMockHabit({ title: 'Walk', isOverdue: true, isCompleted: false }), { ...habit, title: 'Read outside' }],
      totalCount: 2,
    }
    view.rerender(<TodayComposer />)
    expect(screen.getByRole('button', { name: 'shell.composer.chips.today.logHabit' })).toBe(chip)
    expect(chip).toHaveFocus()
    expect(chip).not.toHaveTextContent('Read outside')
    expect(screen.getByRole('button', { name: 'shell.composer.chips.today.moveOverdue' })).toBeInTheDocument()
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
    const suggestion = result.current.composerProps.suggestions.find(chip => chip.id === 'today.startOneHabit')!

    act(() => suggestion.onSelect())
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe(suggestion.label)
  })

  it.each([
    ['en', 'Build a morning routine', 'Build a morning routine'],
    ['pt-BR', 'Montar rotina matinal', 'Montar uma rotina matinal'],
  ] as const)('sends the original morning prompt once from the compact chip in %s', async (locale, label, prompt) => {
    mocks.locale = locale
    mocks.translate = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = { topLevelHabits: [], totalCount: 0 }
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname: '/', totalHabitCount: 0 }))
    const suggestion = result.current.composerProps.suggestions[0]!
    expect(suggestion.id).toBe('today.buildMorningRoutine')
    expect(suggestion.label).toBe(label)
    expect(mocks.fetch).not.toHaveBeenCalled()

    act(() => suggestion.onSelect())
    await waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Hi there'))
    expect(mocks.fetch).toHaveBeenCalledOnce()
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe(prompt)
    expect(useChatStore.getState().messages.filter(message => message.role === 'user').map(message => message.content)).toEqual([prompt])
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it.each(['moveOverdue', 'logHabit', 'trimHabit', 'keepOnlyHabit', 'reviewHabit', 'createGoal'])('sends the complete habit title behind the short %s label', async action => {
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const title = 'Read a chapter with "quotes" and accents á '.repeat(5)
    const habit = createMockHabit({ title, isOverdue: true, hasSubHabits: true, isCompleted: action === 'reviewHabit' })
    mocks.state.habitData = { topLevelHabits: [habit], totalCount: 1 }
    mocks.state.profile = createMockProfile({ lastCompletionDate: action === 'keepOnlyHabit' ? '2026-09-08' : null })
    const surface = action === 'createGoal' ? 'progress' : 'today'
    const { result } = renderHook(() => useChatComposer({ pathname: surface === 'progress' ? '/progress' : '/' }))
    const suggestion = result.current.composerProps.suggestions.find(chip => chip.id === `${surface}.${action}`)!
    expect(suggestion.label).toBe(`shell.composer.chips.${surface}.${action}`)
    act(() => suggestion.onSelect())
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody = mocks.fetch.mock.calls[0]![1].body as FormData
    expect(requestBody.get('message')).toBe(`shell.composer.prompts.${surface}.${action}:${JSON.stringify({ title })}`)
  })

  it.each(['/progress', '/'])('sends the selected goal suggestion from %s without replacing the saved draft', async pathname => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    useChatStore.setState({ draft: 'Unsent note', draftHydrated: true })
    prepareChatRequest(useChatStore.getState(), {
      id: 'goal-detail:reading', label: 'Astra', prompt: 'Help me with my reading goal',
    })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname }))
    expect(result.current.composerProps.suggestions[0]?.id).toBe('goal-detail:reading')
    act(() => { result.current.composerProps.suggestions[0]?.onSelect() })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('Help me with my reading goal')
    expect(useChatStore.getState().draft).toBe('Unsent note')
  })

  it.each([
    ['/', 'today.buildMorningRoutine'],
    ['/calendar', 'today.logYesterday'],
    ['/progress', 'progress.stuckThisWeek'],
    ['/profile', 'profile.changeTimezone'],
    ['/habits/reading', 'habitDetail.pauseThisWeek'],
  ])('restores %s suggestions after successfully handling the selected goal request', async (pathname, expectedChip) => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = makeHabitDetail()
    useChatStore.setState({ draft: 'Unsent note', draftHydrated: true })
    prepareChatRequest(useChatStore.getState(), {
      id: 'goal-detail:reading', label: 'Astra', prompt: 'Help me with my reading goal',
    })
    const request = useChatStore.getState().contextualSuggestion
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const { result, rerender } = renderHook(({ pathname }) => useChatComposer({ pathname }), { initialProps: { pathname: '/progress' } })
    act(() => { result.current.composerProps.suggestions[0]?.onSelect() })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    expect(useChatStore.getState().contextualSuggestion).toBe(request)
    await act(async () => {
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
    })
    await waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Hi there'))
    act(() => useUIStore.getState().setAstraConversationOpen(false))
    rerender({ pathname })
    const chips = result.current.composerProps.suggestions.map(chip => chip.id)
    expect(chips).toContain(expectedChip)
    expect(chips).not.toContain('goal-detail:reading')
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
    expect(useChatStore.getState().draft).toBe('Unsent note')
  })

  it('retains the failed selected goal request until retry succeeds', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = makeHabitDetail()
    useChatStore.setState({ draft: 'Unsent note', draftHydrated: true })
    prepareChatRequest(useChatStore.getState(), {
      id: 'goal-detail:reading', label: 'Astra', prompt: 'Help me with my reading goal',
    })
    const request = useChatStore.getState().contextualSuggestion
    mocks.fetch
      .mockResolvedValueOnce(sseResponse(frame('{"type":"error","status":500,"error":"Unavailable"}')))
      .mockResolvedValueOnce(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname: '/progress' }))
    await act(async () => { result.current.composerProps.suggestions[0]?.onSelect() })
    await waitFor(() => expect(result.current.canRetryLastSend).toBe(true))
    expect(useChatStore.getState().contextualSuggestion).toBe(request)
    expect(useChatStore.getState().draft).toBe('Unsent note')
    expect(result.current.composerProps.suggestions[0]?.id).toBe('goal-detail:reading')
    await act(async () => { await result.current.retryLastSend() })
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
    expect(useChatStore.getState().draft).toBe('Unsent note')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(useChatStore.getState().messages.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it.each(['goal-detail:running', 'goal-detail:reading'])('preserves the newer %s request when an earlier selected goal send settles', async id => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = makeHabitDetail()
    useChatStore.setState({ draft: 'Unsent note', draftHydrated: true })
    prepareChatRequest(useChatStore.getState(), {
      id: 'goal-detail:reading', label: 'Astra', prompt: 'Help me with my reading goal',
    })
    const request = useChatStore.getState().contextualSuggestion
    const stream = controlledSseResponse()
    mocks.fetch.mockResolvedValue(stream.response)
    const { result } = renderHook(() => useChatComposer({ pathname: '/progress' }))
    act(() => { result.current.composerProps.suggestions[0]?.onSelect() })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    act(() => prepareChatRequest(useChatStore.getState(), {
      id, label: 'Astra', prompt: 'Help me with the newly selected goal',
    }))
    const newerRequest = useChatStore.getState().contextualSuggestion
    expect(newerRequest).not.toBe(request)
    await act(async () => {
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
    })
    await waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Hi there'))
    expect(useChatStore.getState().contextualSuggestion).toBe(newerRequest)
    expect(result.current.composerProps.suggestions[0]?.id).toBe(id)
    expect(useChatStore.getState().draft).toBe('Unsent note')
  })

  it('keeps the selected goal request pending when another suggestion succeeds', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = makeHabitDetail()
    useChatStore.setState({ draft: 'Unsent note', draftHydrated: true })
    prepareChatRequest(useChatStore.getState(), {
      id: 'goal-detail:reading', label: 'Astra', prompt: 'Help me with my reading goal',
    })
    const request = useChatStore.getState().contextualSuggestion
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname: '/progress' }))
    await act(async () => { result.current.composerProps.suggestions[1]?.onSelect() })
    await waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Hi there'))
    expect(useChatStore.getState().contextualSuggestion).toBe(request)
    expect(result.current.composerProps.suggestions[0]?.id).toBe('goal-detail:reading')
    expect(useChatStore.getState().draft).toBe('Unsent note')
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

  it.each(['loading', 'error'] as const)('selects the requested Progress goal beside an existing draft while habits are %s', async status => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = null
    mocks.state.habitsError = status === 'error'
    useChatStore.getState().setDraft('Unsent note')
    prepareChatRequest(useChatStore.getState(), {
      id: 'progress-create-goal', label: 'Create a goal', prompt: 'Help me make a goal',
    })
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    function GoalRequestComposer() {
      const chat = useChatComposer({ pathname: '/progress' })
      return <Composer {...chat.composerProps} />
    }
    render(<GoalRequestComposer />)
    expect(screen.getByRole('textbox')).toHaveValue('Unsent note')
    const group = screen.getByRole('group', { name: 'shell.composer.suggestionsLabel' })
    const chips = group.querySelectorAll('button')
    expect(chips.length).toBeGreaterThanOrEqual(3)
    expect(chips[0]).toHaveAccessibleName('Create a goal')
    fireEvent.click(screen.getByRole('button', { name: 'Create a goal' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('Help me make a goal')
    expect(screen.getByRole('textbox')).toHaveValue('Unsent note')
    expect(useChatStore.getState().draft).toBe('Unsent note')
  })

  it('uses loaded habit detail while the separate day query is unavailable', () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = null
    mocks.state.detail = makeHabitDetail()
    const { result } = renderHook(() => useChatComposer({ pathname: '/habits/habit-1' }))
    expect(result.current.composerProps.suggestions.map((chip) => chip.id)).toEqual([
      'habitDetail.pauseThisWeek', 'habitDetail.rename',
    ])
  })

  it.each([
    ['en', 'rename', 'Rename', 'Rename the habit "Ler"'],
    ['en', 'pauseThisWeek', 'Pause this week', 'Pause the habit "Ler" this week'],
    ['pt-BR', 'rename', 'Renomear', 'Renomear o hábito "Ler"'],
    ['pt-BR', 'pauseThisWeek', 'Pausar esta semana', 'Pausar o hábito "Ler" esta semana'],
  ] as const)('sends the named habit detail request in %s for %s', async (locale, action, label, prompt) => {
    mocks.locale = locale
    mocks.translate = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = { ...makeHabitDetail(), title: 'Ler' }
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname: '/habits/habit-1' }))
    const suggestion = result.current.composerProps.suggestions.find(chip => chip.id === `habitDetail.${action}`)!
    expect(suggestion.label).toBe(label)
    act(() => suggestion.onSelect())
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody = mocks.fetch.mock.calls[0]![1].body as FormData
    expect(requestBody.get('message')).toContain('Ler')
    expect(requestBody.get('message')).toBe(prompt)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('sends the first habit detail chip as a pause request', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = makeHabitDetail()
    mocks.fetch.mockResolvedValue(sseResponse(finalFrame(makeChatResponse())))
    const { result } = renderHook(() => useChatComposer({ pathname: '/habits/habit-1' }))
    const suggestion = result.current.composerProps.suggestions[0]!
    expect(suggestion.id).toBe('habitDetail.pauseThisWeek')
    act(() => suggestion.onSelect())
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const requestBody: unknown = mocks.fetch.mock.calls[0]?.[1]?.body
    if (!(requestBody instanceof FormData)) throw new Error('Expected chat request FormData')
    expect(requestBody.get('message')).toBe('shell.composer.prompts.habitDetail.pauseThisWeek:{"title":"Read"}')
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
