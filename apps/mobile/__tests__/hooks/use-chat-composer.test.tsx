import React from 'react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { buildComposerChips, CHAT_STREAM_IDLE_TIMEOUT_MS } from '@orbit/shared/chat'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import type { ChatMessage, ChatResponse } from '@orbit/shared/types/chat'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitDetail, HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { i18n } from '@/lib/i18n'
import type { DocumentPickerAsset } from 'expo-document-picker'

import { Linking, StyleSheet, type FlatList } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { prepareChatRequest } from '@orbit/shared/stores'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { advanceAccountGeneration, advanceSessionEpoch } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import RootLayout from '@/app/_layout'
import { AccessibilityInfo as TestAccessibilityInfo, __focusHost, __getFocusedNativeTag, __setFocusImpl, __setTouchMode, __resetTestHostConfig } from '../../test-mocks/react-native'

const { Composer: ShellComposer } = await vi.importActual<typeof import('@/components/shell/composer')>('@/components/shell/composer')
const { Shell412: ConversationShell } = await vi.importActual<typeof import('@/components/shell/shell-412')>('@/components/shell/shell-412')
const { AstraConversation: Conversation } = await vi.importActual<typeof import('@/components/chat/conversation')>('@/components/chat/conversation')

const TestRenderer = require('react-test-renderer')
const mountedTrees: ReturnType<typeof TestRenderer.create>[] = []

const mocks = vi.hoisted(() => {
  const state = {
    profile: undefined as Profile | undefined,
    habitData: { topLevelHabits: [] as NormalizedHabit[], totalCount: 0 } as { topLevelHabits: NormalizedHabit[]; totalCount: number } | null,
    detail: null as HabitDetail | null,
    habitFilters: [] as HabitsFilter[],
    habitsError: false,
    speechError: null as string | null,
    recordingDuration: 0,
    isRecording: false,
    isTranscribing: false,
    speechSupported: true,
    transcript: '',
  }

  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn(),
  }

  return {
    translate: undefined as ((key: string, params?: Record<string, unknown>) => string) | undefined,
    locale: 'en',
    state,
    pathname: '/support',
    composerProps: null as { onOpenConversation?: () => void; onChangeValue: (value: string) => void; onSend: () => void } | null,
    queryClient,
    apiClient: vi.fn(),
    openChatStream: vi.fn(),
    getDocumentAsync: vi.fn(),
    fileSize: 1024,
    readFileText: vi.fn(),
    requestMediaLibraryPermissionsAsync: vi.fn(),
    launchImageLibraryAsync: vi.fn(),
    routerPush: vi.fn(),
    toggleRecording: vi.fn(),
    useQueryClient: vi.fn(() => queryClient),
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: mocks.translate ?? ((key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key),
    i18n: { language: mocks.locale },
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
  useQuery: () => ({ data: undefined, error: null, isLoading: false, isError: false }),
  useMutation: (options: { mutationFn?: (value: unknown) => unknown }) => ({
    mutate: (value: unknown) => options.mutationFn?.(value),
    isPending: false,
  }),
}))
vi.mock('@/lib/query-client', () => ({ clearPersistedQueryCache: vi.fn() }))
vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn(),
  createQueuedAck: vi.fn(),
  isQueuedResult: vi.fn(() => false),
  queueOrExecute: vi.fn(),
}))
vi.mock('@/lib/offline-queue', () => ({ clear: vi.fn(), enqueue: vi.fn() }))
vi.mock('@/lib/checklist-template-storage', () => ({ clearChecklistTemplates: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/chat-stream', () => ({
  openChatStream: mocks.openChatStream,
}))

vi.mock('expo-router', () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  Stack: Object.assign(({ children }: { children?: React.ReactNode }) => children, {
    Protected: ({ children }: { children?: React.ReactNode }) => children,
    Screen: () => null,
  }),
  ThemeProvider: ({ children }: { children?: React.ReactNode }) => children,
  useGlobalSearchParams: () => ({}),
  usePathname: () => mocks.pathname,
  useSegments: () => ['support'],
  useRouter: () => ({ push: mocks.routerPush, replace: vi.fn() }),
}))

vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn().mockResolvedValue(true), shareAsync: vi.fn() }))
vi.mock('expo-device', () => ({ __esModule: true, default: { isDevice: true }, isDevice: true }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-native')>()
  return {
    ...original,
    Linking: { openSettings: vi.fn().mockResolvedValue(undefined) },
    FlatList: React.forwardRef<unknown, {
      data: ChatMessage[]
      renderItem: (entry: { item: ChatMessage; index: number }) => React.ReactNode
    }>((props, _ref) => React.createElement('FlatList', props,
      props.data.map((item, index) => <React.Fragment key={item.id}>{props.renderItem({ item, index })}</React.Fragment>),
    )),
  }
})

vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: () => null,
  Path: () => null,
  Defs: () => null,
  Stop: () => null,
  Rect: () => null,
}))
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }))
vi.mock('expo-router/react-navigation', () => ({}))
vi.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => children }))
vi.mock('@sentry/react-native', () => ({ wrap: (component: unknown) => component }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children?: React.ReactNode }) => children, useCaptureReady: () => false }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }) }))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ clearLevelUp: vi.fn(), crossedStreakMilestones: [], leveledUp: false, newAchievements: [], newLevel: null }),
  useReportEvent: () => ({ mutate: vi.fn() }),
  useStreakInfo: () => ({ data: { currentStreak: 0, isFrozenToday: false } }),
}))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: vi.fn() }))
vi.mock('@/hooks/use-habits', () => ({ useTotalHabitCount: () => 0 }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark', surfaces: { elevated: { backgroundColor: '#18181b' }, screen: { backgroundColor: '#111111' } } }) }))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetTheme: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/back-navigation', () => ({ dismissOrFallback: vi.fn(), getAndroidBackFallbackRoute: () => null }))
vi.mock('@/lib/overlay-stack', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/overlay-stack')>(), dismissTopOverlay: () => false }))
vi.mock('@/lib/upgrade-route', () => ({ buildUpgradeHref: () => '/upgrade' }))
vi.mock('@/stores/referral-prompt-store', () => ({ useReferralPromptStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ armConsentPrompt: vi.fn(), armMilestoneSharePrompt: vi.fn(), armReferralPrompt: vi.fn(), armReviewPrompt: vi.fn() }) }))
vi.mock('@/stores/review-reminder-store', () => ({ isReviewMomentEligible: () => false, useReviewReminderStore: { getState: () => ({}) } }))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({ useLiveOnboardingActions: () => ({}) }))
vi.mock('@/stores/onboarding-draft-store', () => ({ useOnboardingDraftStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ hasPendingAnswers: () => false, onboardingLocallyDone: true }) }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: vi.fn() }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
vi.mock('@/components/navigation/destination-tab-bar', () => ({ DestinationTabBar: () => null }))
vi.mock('@/components/search/search-header-action', () => ({ SearchHeader: () => null }))
vi.mock('@/components/ui/fab', () => ({ Fab: () => null }))
vi.mock('@/components/global-overlays', () => ({ OverlayLayer: () => null }))
vi.mock('@/components/offline-notice', () => ({ useOfflineNoticeContent: () => null }))
vi.mock('@/components/gamification/celebration-panel', () => ({ CelebrationPanel: () => null }))
vi.mock('@/components/ui/app-toast', () => ({ AppToast: () => null }))
vi.mock('@/components/ui/app-error-boundary', () => ({ AppErrorScreen: () => null }))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: ({ message }: { message: ChatMessage }) => React.createElement('Text', null, message.content) }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/chat/conversation', () => ({ AstraConversation: () => null }))
vi.mock('@/components/shell/composer', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/shell/composer')>()
  return { Composer: (props: React.ComponentProps<typeof original.Composer>) => { mocks.composerProps = props; return <original.Composer {...props} /> } }
})
vi.mock('@/components/shell/shell-412', () => ({ Shell412: ({ composer }: { composer?: React.ReactNode }) => composer ?? null }))
vi.mock('@/components/throttle-screen', () => ({ ThrottleScreen: () => null }))
vi.mock('@/components/upgrade-required-screen', () => ({ UpgradeRequiredScreen: () => null }))
vi.mock('@/lib/capture-mode', () => ({ captureBuildEnabled: false, captureRequestProbeIdFromUrl: () => null, captureRouteProbeId: () => 'capture-probe', shouldExposeOnboardingRoute: () => false }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-push-notifications', () => ({ PushNotificationsProvider: ({ children }: { children?: React.ReactNode }) => children }))

vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
}))

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: mocks.getDocumentAsync,
}))

vi.mock('expo-file-system', () => ({
  File: class MockFile extends Blob {
    constructor() {
      super(['x'.repeat(mocks.fileSize)])
    }

    text(): Promise<string> {
      return mocks.readFileText()
    }
  },
}))

vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabits: (filters: HabitsFilter) => { mocks.state.habitFilters.push(filters); return { data: mocks.state.habitData, isError: mocks.state.habitsError } },
  useHabitDetail: () => ({ data: mocks.state.detail, isError: false }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
  useProfile: () => ({ profile: mocks.state.profile }),
}))

vi.mock('@/hooks/use-speech-to-text', () => ({
  useSpeechToText: () => ({
    isRecording: mocks.state.isRecording,
    isTranscribing: mocks.state.isTranscribing,
    isSupported: mocks.state.speechSupported,
    transcript: mocks.state.transcript,
    error: mocks.state.speechError,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    toggleRecording: mocks.toggleRecording,
    recordingDuration: mocks.state.recordingDuration,
  }),
}))

type ComposerApi = ReturnType<typeof useChatComposer>

async function renderComposer(
  options: { isOnline?: boolean; offlineTitle?: string; pathname?: string; today?: string; selectedDate?: string; includeGeneral?: boolean } = {},
): Promise<{ current: ComposerApi; rerender: () => void; unmount: () => void }> {
  const ref: { current: ComposerApi | null } = { current: null }

  function Harness() {
    ref.current = useChatComposer({
      isOnline: options.isOnline ?? true,
      offlineTitle: options.offlineTitle ?? 'offline',
      pathname: options.pathname,
      today: options.today,
      selectedDate: options.selectedDate,
      includeGeneral: options.includeGeneral,
    })
    return null
  }

  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<Harness />)
    mountedTrees.push(tree)
    await Promise.resolve()
  })

  if (!ref.current) {
    throw new Error('useChatComposer did not render')
  }

  return {
    get current() {
      return ref.current as ComposerApi
    },
    rerender() {
      TestRenderer.act(() => tree.update(<Harness />))
    },
    unmount() {
      TestRenderer.act(() => tree.unmount())
    },
  }
}

function makeChatResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    aiMessage: 'Hi there',
    actions: [],
    ...overrides,
  }
}


const frame = (json: string) => `data: ${json}\n\n`

function finalFrame(response: ChatResponse): string {
  return frame(JSON.stringify({ type: 'final', response }))
}

function sseStreamResponse(...frames: string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const sseFrame of frames) {
        controller.enqueue(encoder.encode(sseFrame))
      }
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    body,
    json: () => Promise.resolve(null),
  }
}

function controlledSseStreamResponse() {
  const encoder = new TextEncoder()
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
  })
  return {
    response: {
      ok: true,
      status: 200,
      body,
      json: () => Promise.resolve(null),
    },
    enqueue: (sseFrame: string) => streamController.enqueue(encoder.encode(sseFrame)),
    close: () => streamController.close(),
  }
}

function httpErrorResponse(status: number, errorBody: { error?: string; errorCode?: string }) {
  return {
    ok: false,
    status,
    body: null,
    json: () => Promise.resolve(errorBody),
  }
}

function documentPickerAsset(
  overrides: Partial<DocumentPickerAsset> = {},
): DocumentPickerAsset {
  return {
    name: 'notes.txt',
    uri: 'file:///notes.txt',
    lastModified: 0,
    ...overrides,
  }
}

function ComposerConversationHarness() {
  const chat = useChatComposer({ pathname: '/profile', isOnline: true, offlineTitle: 'Offline' })
  const open = useUIStore((state) => state.astraConversationOpen)
  return <ConversationShell
    tabBar={null}
    composer={<ShellComposer {...chat.composerProps} onOpenConversation={() => useUIStore.getState().setAstraConversationOpen(true)} conversationLabel="Open Astra" />}
    conversation={<Conversation chat={chat} />}
    conversationOpen={open}
    conversationLabel="Astra"
  />
}

async function renderConversationHarness() {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => { tree = TestRenderer.create(<ComposerConversationHarness />); mountedTrees.push(tree); await Promise.resolve() })
  return tree
}

function visibleMessageTexts(tree: ReturnType<typeof TestRenderer.create>): string[] {
  return tree.root.findAll((node: { type: unknown; props: { children?: unknown } }) => node.type === 'Text' && typeof node.props.children === 'string')
    .map((node: { props: { children: string } }) => node.props.children)
}

function visibleComposerRoot(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => node.type === 'View' && node.props.testID === 'shell-conversation')[0] ?? tree.root
}

function inputHosts(tree: ReturnType<typeof TestRenderer.create>) {
  return visibleComposerRoot(tree).findAll((node: { type: unknown }) => node.type === 'TextInput')
}

describe('mobile useChatComposer', () => {
  it('opens the conversation for a shell typed send with the message and streaming answer in its list', async () => {
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const focus = vi.fn()
    __setFocusImpl(focus)
    const tree = await renderConversationHarness()
    TestRenderer.act(() => inputHosts(tree)[0].props.onChangeText('Plan my morning'))
    await TestRenderer.act(async () => { inputHosts(tree)[0].props.onSubmitEditing(); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).toContain('Plan my morning')
    expect(tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => node.type === 'View' && node.props.testID === 'shell-conversation')).toHaveLength(1)
    expect(inputHosts(tree)).toHaveLength(1)
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ testID: 'composer-sending' }))
    await TestRenderer.act(async () => { stream.enqueue(frame('{"type":"delta","text":"Start with water"}')); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).toContain('Plan my morning')
    expect(visibleMessageTexts(tree)).toContain('Start with water')
    const list = tree.root.findByType('FlatList')
    expect(list.props.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'Plan my morning' }),
      expect.objectContaining({ role: 'ai', content: 'Start with water' }),
    ]))
    await TestRenderer.act(async () => { stream.enqueue(finalFrame(makeChatResponse())); stream.close(); await Promise.resolve() })
  })

  it('does not reclaim native focus after the person leaves the composer during a streamed send', async () => {
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const focus = vi.fn()
    __setFocusImpl(focus)
    const tree = await renderConversationHarness()
    TestRenderer.act(() => inputHosts(tree)[0].props.onChangeText('Plan my morning'))
    await TestRenderer.act(async () => { inputHosts(tree)[0].props.onSubmitEditing(); await Promise.resolve() })
    const closeButton = tree.root.findAll((node: { type: unknown; props: { accessibilityLabel?: string } }) => node.type === 'Pressable' && node.props.accessibilityLabel === 'common.closeConversation')[0]
    TestRenderer.act(() => { __setTouchMode(false); __focusHost(closeButton.props.__nativeTag) })
    expect(__getFocusedNativeTag()).toBe(closeButton.props.__nativeTag)
    focus.mockClear()
    await TestRenderer.act(async () => { stream.enqueue(finalFrame(makeChatResponse())); stream.close(); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).toContain('Hi there')
    expect(focus).not.toHaveBeenCalled()
    expect(__getFocusedNativeTag()).toBe(closeButton.props.__nativeTag)
  })

  it.each([true, false])('restores native input focus after parking during streaming (touch mode: %s)', async (inTouchMode) => {
    __setTouchMode(inTouchMode)
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const focus = vi.fn()
    __setFocusImpl(focus)
    const tree = await renderConversationHarness()
    TestRenderer.act(() => inputHosts(tree)[0].props.onChangeText('Plan my morning'))
    await TestRenderer.act(async () => { inputHosts(tree)[0].props.onSubmitEditing(); await Promise.resolve() })
    const composer = visibleComposerRoot(tree).findAll((node: { type: unknown; props: { testID?: string } }) => node.type === 'View' && node.props.testID === 'composer-sending')[0]
    expect(__getFocusedNativeTag()).toBe(composer.props.__nativeTag)
    expect(inputHosts(tree)[0].props.editable).toBe(false)
    focus.mockClear()
    await TestRenderer.act(async () => { stream.enqueue(finalFrame(makeChatResponse())); stream.close(); await Promise.resolve() })
    expect(focus).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ editable: true }))
    expect(__getFocusedNativeTag()).toBe(inputHosts(tree)[0].props.__nativeTag)
    expect(inputHosts(tree)).toHaveLength(1)
  })

  it('does not move native focus off the voice stop control when recording starts', async () => {
    const focus = vi.fn()
    __setFocusImpl(focus)
    const tree = await renderConversationHarness()
    TestRenderer.act(() => inputHosts(tree)[0].props.onFocus())
    const voiceButton = visibleComposerRoot(tree).findAll((node: { type: unknown; props: { accessibilityLabel?: string } }) => node.type === 'Pressable' && node.props.accessibilityLabel === 'shell.composer.actions')[0]
    TestRenderer.act(() => { __setTouchMode(false); __focusHost(voiceButton.props.__nativeTag) })
    expect(__getFocusedNativeTag()).toBe(voiceButton.props.__nativeTag)
    focus.mockClear()
    mocks.state.isRecording = true
    await TestRenderer.act(async () => { tree.update(<ComposerConversationHarness />); await Promise.resolve() })
    expect(visibleComposerRoot(tree).findAll((node: { type: unknown; props: { accessibilityLabel?: string } }) => node.type === 'Pressable' && node.props.accessibilityLabel === 'shell.composer.voice.stop')).toHaveLength(1)
    expect(focus).not.toHaveBeenCalled()
    expect(__getFocusedNativeTag()).toBe(voiceButton.props.__nativeTag)
  })

  it('opens on shell field focus and carries every draft edit into the sole conversation input', async () => {
    useChatStore.setState({ draft: 'Already typed' })
    const focus = vi.fn()
    __setFocusImpl(focus)
    const tree = await renderConversationHarness()
    TestRenderer.act(() => inputHosts(tree)[0].props.onFocus())
    expect(tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => node.type === 'View' && node.props.testID === 'shell-conversation')).toHaveLength(1)
    expect(inputHosts(tree)).toHaveLength(1)
    expect(inputHosts(tree)[0].props.value).toBe('Already typed')
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ value: 'Already typed' }))
    TestRenderer.act(() => inputHosts(tree)[0].props.onChangeText('Already typed and continued'))
    expect(useChatStore.getState().draft).toBe('Already typed and continued')
  })

  it('keeps chip sends in the conversation with focus in its only composer', async () => {
    mocks.state.profile = createMockProfile()
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const focus = vi.fn()
    __setFocusImpl(focus)
    const tree = await renderConversationHarness()
    const group = tree.root.findByProps({ accessibilityLabel: 'shell.composer.suggestionsLabel' })
    const chip = group.findAll((node: { type: unknown }) => node.type === 'Pressable')[0]
    await TestRenderer.act(async () => { chip.props.onPress(); await Promise.resolve() })
    expect(inputHosts(tree)).toHaveLength(1)
    expect(focus).toHaveBeenCalled()
    expect(visibleMessageTexts(tree)).toContain('Hi there')
    expect(tree.root.findByType('FlatList').props.data).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'ai', content: 'Hi there' })]))
  })

  it('keeps voice failures and settings recovery visible in the dock without losing the draft', async () => {
    useChatStore.setState({ draft: 'Keep my draft', draftHydrated: true })
    const openSettings = vi.spyOn(Linking, 'openSettings')
    const tree = await renderConversationHarness()
    mocks.state.speechError = 'speech.micDenied'
    await TestRenderer.act(async () => { tree.update(<ComposerConversationHarness />); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).toContain('speech.micDenied')
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
    expect(inputHosts(tree)[0].props.value).toBe('Keep my draft')
    const recovery = tree.root.findAll((node: { type: unknown; props: { accessibilityLabel?: string } }) => node.type === 'Pressable' && node.props.accessibilityLabel === 'common.openSettings')
    expect(recovery).toHaveLength(1)
    expect(StyleSheet.flatten(recovery[0].props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(48)
    TestRenderer.act(() => recovery[0].props.onPress())
    expect(openSettings).toHaveBeenCalledOnce()
    await TestRenderer.act(async () => { tree.update(<ComposerConversationHarness />); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).toContain('speech.micDenied')
    mocks.state.speechError = null
    mocks.state.isRecording = true
    await TestRenderer.act(async () => { tree.update(<ComposerConversationHarness />); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).not.toContain('speech.micDenied')
    expect(visibleMessageTexts(tree)).not.toContain('common.openSettings')
    expect(visibleComposerRoot(tree).findAll((node: { type: unknown; props: { accessibilityLabel?: string } }) => node.type === 'Pressable' && node.props.accessibilityLabel === 'shell.composer.voice.stop')).toHaveLength(1)
    mocks.state.isRecording = false
    mocks.state.isTranscribing = true
    await TestRenderer.act(async () => { tree.update(<ComposerConversationHarness />); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).not.toContain('speech.micDenied')
    mocks.state.isTranscribing = false
    mocks.state.transcript = 'Voice recovered'
    await TestRenderer.act(async () => { tree.update(<ComposerConversationHarness />); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).not.toContain('speech.micDenied')
    expect(inputHosts(tree)[0].props.value).toBe('Keep my draft Voice recovered')
  })

  it.each(['transport', 'attachment'] as const)('preserves a %s error through speech denial and recovery', async (producer) => {
    const composer = await renderComposer()
    if (producer === 'transport') {
      mocks.openChatStream.mockRejectedValueOnce(new Error('network unavailable'))
      await TestRenderer.act(async () => { await composer.current.sendMessage('Plan my morning') })
    } else {
      mocks.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [documentPickerAsset({ size: 21 * 1024 * 1024 })] })
      await TestRenderer.act(async () => { composer.current.composerProps.onAttachFile?.(); await Promise.resolve() })
    }
    const originalError = composer.current.composerProps.errorMessage
    expect(originalError).toBeTruthy()
    mocks.state.speechError = 'speech.micDenied'
    await TestRenderer.act(async () => { composer.rerender(); await Promise.resolve() })
    expect(composer.current.composerProps.errorMessage).toBe('speech.micDenied')
    mocks.state.speechError = null
    mocks.state.isRecording = true
    composer.rerender()
    expect(composer.current.composerProps.errorMessage).toBe(originalError)
    expect(composer.current.composerProps.errorRecovery).toBeUndefined()
    mocks.state.isRecording = false
    mocks.state.transcript = 'Voice recovered'
    composer.rerender()
    expect(composer.current.composerProps.errorMessage).toBe(originalError)
  })

  it('offers one retry action in the owning conversation after a transport failure', async () => {
    mocks.openChatStream.mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(sseStreamResponse(finalFrame(makeChatResponse())))
    const tree = await renderConversationHarness()
    TestRenderer.act(() => inputHosts(tree)[0].props.onChangeText('Plan my morning'))
    await TestRenderer.act(async () => { inputHosts(tree)[0].props.onSubmitEditing(); await Promise.resolve() })
    expect(visibleMessageTexts(tree)).toContain('chat.sendError')
    const retries = visibleComposerRoot(tree).findAll((node: { type: unknown; findAll: (predicate: (child: { type: unknown; props: { children?: unknown } }) => boolean) => unknown[] }) =>
      node.type === 'Pressable' && node.findAll((child) => child.type === 'Text' && child.props.children === 'shell.composer.retry').length > 0)
    expect(retries).toHaveLength(1)
    await TestRenderer.act(async () => { retries[0].props.onPress(); await Promise.resolve() })
    expect(mocks.openChatStream).toHaveBeenCalledTimes(2)
    expect(visibleMessageTexts(tree)).toContain('Hi there')
    expect(visibleMessageTexts(tree)).not.toContain('chat.sendError')
    expect(visibleMessageTexts(tree)).not.toContain('shell.composer.retry')
  })

  it('opens the conversation when sending a finished voice transcript', async () => {
    mocks.state.isRecording = true
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()
    mocks.state.isRecording = false
    mocks.state.transcript = 'Voice request'
    composer.rerender()
    await TestRenderer.act(async () => { composer.current.composerProps.onSend(); await Promise.resolve() })
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().messages[0]?.content).toBe('Voice request')
  })

  it('sends the profile clock preference to Astra', async () => {
    mocks.state.profile = createMockProfile({ uses24HourClock: true })
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()
    await TestRenderer.act(async () => { await composer.current.sendMessage('Hello') })
    const formData = mocks.openChatStream.mock.calls[0]?.[0] as { get(name: string): string | null }
    const context = JSON.parse(formData.get('clientContext') as string)
    expect(context.timeFormat).toBe('24h')
  })

  it('keeps tool steps and follow-ups on the final answer and marks a chip send', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(
      frame('{"type":"step","domain":"habits","access":"read"}'),
      frame('{"type":"step","domain":"goals","access":"write"}'),
      finalFrame(makeChatResponse({ followUps: ['Check goals', 'Review habits'] })),
    ))
    const composer = await renderComposer()
    mocks.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [documentPickerAsset()] })
    mocks.readFileText.mockResolvedValue('Keep this file')
    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledOnce())
    })
    TestRenderer.act(() => composer.current.setInput('Keep this draft'))
    await TestRenderer.act(async () => { await composer.current.sendMessage('Check goals', 'followUp') })
    const answer = useChatStore.getState().messages.at(-1)
    expect(answer?.toolSteps).toEqual([
      { domain: 'habits', access: 'read' }, { domain: 'goals', access: 'write' },
    ])
    expect(answer?.followUps).toEqual(['Check goals', 'Review habits'])
    const formData = mocks.openChatStream.mock.calls[0]?.[0] as { get(name: string): string | null }
    expect(formData.get('message')).toBe('Check goals')
    expect(formData.get('image')).toBeNull()
    expect(composer.current.input).toBe('Keep this draft')
    expect(composer.current.selectedTextFile?.name).toBe('notes.txt')
    const context = JSON.parse(formData.get('clientContext') as string)
    expect(context).toMatchObject({ messageOrigin: 'followUp', supportsHabitListDoneStatus: true, supportsPendingOperationChanges: true, supportsToolSteps: true, supportsFollowUps: true })
  })

  beforeEach(() => {
    mocks.translate = undefined
    mocks.locale = 'en'
    __resetTestHostConfig()
    mocks.composerProps = null
    mocks.state.profile = undefined
    mocks.state.habitData = { topLevelHabits: [], totalCount: 0 }
    mocks.state.detail = null
    mocks.state.habitFilters = []
    mocks.state.habitsError = false
    mocks.state.speechError = null
    mocks.state.recordingDuration = 0
    mocks.state.isRecording = false
    mocks.state.isTranscribing = false
    mocks.state.speechSupported = true
    mocks.state.transcript = ''
    mocks.apiClient.mockReset()
    mocks.openChatStream.mockReset()
    mocks.getDocumentAsync.mockReset()
    mocks.fileSize = 1024
    mocks.readFileText.mockReset()
    mocks.readFileText.mockResolvedValue('Walk')
    mocks.requestMediaLibraryPermissionsAsync.mockReset()
    mocks.launchImageLibraryAsync.mockReset()
    mocks.routerPush.mockReset()
    mocks.toggleRecording.mockReset()
    mocks.queryClient.invalidateQueries.mockReset()
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
    mocks.queryClient.setQueryData.mockClear()
    useChatStore.setState({ messages: [], isTyping: false, streamingMessageId: null, draft: '', draftHydrated: true, contextualSuggestion: null })
    useUIStore.getState().setAstraConversationOpen(false)
    useUIStore.getState().setCalendarHasError(false)
  })

  afterEach(() => {
    for (const tree of mountedTrees.splice(0)) tree.unmount()
  })

  it.each([true, false])('scrolls sent messages with reduced motion %s', async (reducedMotion) => {
    vi.useFakeTimers()
    const listeners = new Set<(enabled: boolean) => void>()
    const subscription = vi.spyOn(TestAccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'reduceMotionChanged') listeners.add(listener)
      return { remove: () => { listeners.delete(listener) } }
    })
    onTestFinished(() => {
      subscription.mockRestore()
      vi.useRealTimers()
    })
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()
    const scrollToEnd = vi.fn()
    composer.current.flatListRef.current = { scrollToEnd } as unknown as FlatList<ChatMessage>
    TestRenderer.act(() => { for (const listener of listeners) listener(reducedMotion) })

    await TestRenderer.act(async () => { await composer.current.sendMessage('hello') })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: !reducedMotion })
    expect(scrollToEnd).not.toHaveBeenCalledWith({ animated: reducedMotion })
    scrollToEnd.mockClear()
    TestRenderer.act(() => { for (const listener of listeners) listener(!reducedMotion) })
    await TestRenderer.act(async () => { await composer.current.sendMessage('hello again') })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: reducedMotion })
    expect(scrollToEnd).not.toHaveBeenCalledWith({ animated: !reducedMotion })
  })

  it('uses the latest motion setting for queued scrolls and active streaming deltas', async () => {
    vi.useFakeTimers()
    const listeners = new Set<(enabled: boolean) => void>()
    const subscription = vi.spyOn(TestAccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'reduceMotionChanged') listeners.add(listener)
      return { remove: () => { listeners.delete(listener) } }
    })
    onTestFinished(() => {
      subscription.mockRestore()
      vi.useRealTimers()
    })
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const composer = await renderComposer()
    const scrollToEnd = vi.fn()
    composer.current.flatListRef.current = { scrollToEnd } as unknown as FlatList<ChatMessage>
    TestRenderer.act(() => { for (const listener of listeners) listener(false) })

    let send!: Promise<void>
    TestRenderer.act(() => { send = composer.current.sendMessage('hello') })
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    TestRenderer.act(() => { for (const listener of listeners) listener(true) })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false })
    expect(scrollToEnd).not.toHaveBeenCalledWith({ animated: true })
    scrollToEnd.mockClear()
    TestRenderer.act(() => { for (const listener of listeners) listener(false) })
    TestRenderer.act(() => stream.enqueue(frame('{"type":"delta","text":"First"}')))
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true })
    expect(scrollToEnd).not.toHaveBeenCalledWith({ animated: false })

    scrollToEnd.mockClear()
    TestRenderer.act(() => { for (const listener of listeners) listener(true) })
    TestRenderer.act(() => stream.enqueue(frame('{"type":"delta","text":" second"}')))
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false })
    expect(scrollToEnd).not.toHaveBeenCalledWith({ animated: true })

    await TestRenderer.act(async () => {
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
      await send
      await vi.advanceTimersByTimeAsync(100)
    })
  })

  it('preserves earlier reading through queued send and stream scrolls until the next send', async () => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const composer = await renderComposer()
    const scrollToEnd = vi.fn()
    composer.current.flatListRef.current = { scrollToEnd } as unknown as FlatList<ChatMessage>
    composer.current.threadScroll.recordScroll(900, 900)

    let send!: Promise<void>
    TestRenderer.act(() => { send = composer.current.sendMessage('hello') })
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    composer.current.threadScroll.recordScroll(100, 900)
    TestRenderer.act(() => stream.enqueue(frame('{"type":"delta","text":"First"}')))
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await TestRenderer.act(async () => {
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
      await send
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(scrollToEnd).not.toHaveBeenCalled()

    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello again')
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(scrollToEnd).toHaveBeenCalled()
  })

  it('sends Support entry intent on the first and later requests of that conversation', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()
    useUIStore.getState().setAstraConversationOpen(true, 'support')

    await TestRenderer.act(async () => { await composer.current.sendMessage('my streak reset') })
    await TestRenderer.act(async () => { await composer.current.sendMessage('can you help?') })

    expect(mocks.openChatStream).toHaveBeenCalledTimes(2)
    for (const [formData] of mocks.openChatStream.mock.calls) {
      const context = JSON.parse((formData as { get(name: string): string | null }).get('clientContext') as string)
      expect(context.entryPointIntent).toBe('support')
    }
  })

  it.each([
    ['/', 'open', undefined],
    ['/', 'direct-send', undefined],
  ])('captures route intent through the layout %s %s callback before the first request', async (pathname, action, expectedIntent) => {
    mocks.pathname = pathname
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    await TestRenderer.act(async () => {
      const tree = TestRenderer.create(<RootLayout />)
      mountedTrees.push(tree)
      await Promise.resolve()
    })
    const composer = mocks.composerProps
    if (!composer) throw new Error('Support composer did not render')
    await TestRenderer.act(() => { composer.onChangeValue('my streak reset') })
    await TestRenderer.act(async () => {
      if (action === 'open') mocks.composerProps?.onOpenConversation?.()
      mocks.composerProps?.onSend()
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledTimes(1))
    const [formData] = mocks.openChatStream.mock.calls[0]!
    const context = JSON.parse((formData as { get(name: string): string | null }).get('clientContext') as string)
    expect(context.entryPointIntent).toBe(expectedIntent)
  })

  it('omits Support entry intent from a normal conversation', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()
    useUIStore.getState().setAstraConversationOpen(true)

    await TestRenderer.act(async () => { await composer.current.sendMessage('log water') })

    const [formData] = mocks.openChatStream.mock.calls[0]!
    const context = JSON.parse((formData as { get(name: string): string | null }).get('clientContext') as string)
    expect(context).not.toHaveProperty('entryPointIntent')
    expect(context.supportsMetricsCard).toBe(true)
    expect(context.supportsPeriodInsightCard).toBe(true)
  })

  it('streams deltas into a single ai bubble and the final response wins', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(
      frame('{"type":"started"}'),
      frame('{"type":"delta","text":"Logged"}'),
      frame('{"type":"delta","text":" it"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Logged it', correlationId: 'trace-1', metricsCard: {
        period: 'week', completionRate: 50, totalCompletions: 1, totalScheduled: 2,
        activeDays: 1, currentStreak: 1, bestStreak: 1, hasData: true, surfaceId: 'progress',
      } })),
    ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('log water')
    })

    const messages = useChatStore.getState().messages
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'log water' })
    expect(messages[1]).toMatchObject({
      role: 'ai',
      content: 'Logged it',
      correlationId: 'trace-1',
      metricsCard: { completionRate: 50 },
    })
    expect(useChatStore.getState().isTyping).toBe(false)
    expect(composer.current.canRetryLastSend).toBe(false)
  })

  it('rejects an overlapping send before a second request starts', async () => {
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const composer = await renderComposer()

    let firstSend!: Promise<void>
    await TestRenderer.act(() => {
      firstSend = composer.current.sendMessage('first')
      stream.enqueue(frame('{"type":"delta","text":"Working"}'))
    })
    await vi.waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('second')
      stream.enqueue(finalFrame(makeChatResponse()))
      stream.close()
      await firstSend
    })

    expect(mocks.openChatStream).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().messages.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('keeps a newer stream active when the finalized request finishes invalidating', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    const firstStream = controlledSseStreamResponse()
    const secondStream = controlledSseStreamResponse()
    mocks.openChatStream
      .mockResolvedValueOnce(firstStream.response)
      .mockResolvedValueOnce(secondStream.response)
    const composer = await renderComposer()

    let sendPromise!: Promise<void>
    await TestRenderer.act(() => {
      sendPromise = composer.current.sendMessage('finish this')
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

    await vi.waitFor(() => expect(useChatStore.getState().messages.at(-1)?.content).toBe('Final list: ['))
    expect(useChatStore.getState().streamingMessageId).toBeNull()
    expect(composer.current.isSending).toBe(false)

    let secondSendPromise!: Promise<void>
    await TestRenderer.act(() => {
      secondSendPromise = composer.current.sendMessage('start another')
      secondStream.enqueue(frame('{"type":"delta","text":"Still [[or"}'))
    })
    await vi.waitFor(() => expect(useChatStore.getState().streamingMessageId).not.toBeNull())
    const secondDraftId = useChatStore.getState().streamingMessageId

    await TestRenderer.act(async () => {
      resolveInvalidations()
      await sendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBe(secondDraftId)

    await TestRenderer.act(async () => {
      secondStream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Second final' })))
      secondStream.close()
      await secondSendPromise
    })
    expect(useChatStore.getState().streamingMessageId).toBeNull()
    const messageIds = useChatStore.getState().messages.map((message) => message.id)
    expect(new Set(messageIds).size).toBe(messageIds.length)
  })

  it('clears the streamed draft on reset so the final answer is not duplicated', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(
      frame('{"type":"delta","text":"Checking"}'),
      frame('{"type":"reset"}'),
      frame('{"type":"round","iteration":1}'),
      frame('{"type":"delta","text":"Done"}'),
      finalFrame(makeChatResponse({ aiMessage: 'Done' })),
    ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('check my goals')
    })

    const aiMessages = useChatStore.getState().messages.filter((message) => message.role === 'ai')
    expect(aiMessages).toHaveLength(1)
    expect(aiMessages[0]?.content).toBe('Done')
  })

  it('bumps the local AI usage count for non-pro users', async () => {
    mocks.state.profile = { aiMessagesUsed: 3 } as Profile
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.queryClient.setQueryData).toHaveBeenCalled()
    const firstCall = mocks.queryClient.setQueryData.mock.calls[0]
    const updater = firstCall?.[1] as (
      current: Profile | undefined,
    ) => Profile | undefined
    expect(updater({ aiMessagesUsed: 3 } as Profile)?.aiMessagesUsed).toBe(4)
  })

  it('bumps daily usage for pro users', async () => {
    mocks.state.profile = { hasProAccess: true, aiMessagesUsed: 0 } as Profile
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.queryClient.setQueryData).toHaveBeenCalled()
  })

  it('keeps a premium denial inline without upgrade routing', async () => {
    mocks.openChatStream.mockResolvedValue(
      httpErrorResponse(403, { error: 'Premium plan required to use AI chat' }),
    )
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.routerPush).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('chat.sendError')
  })

  it('replaces a streamed draft with the daily allowance without routing or arming retry', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(
      frame('{"type":"started"}'),
      frame('{"type":"delta","text":"Checking"}'),
      frame('{"type":"error","status":403,"error":"Daily message limit reached"}'),
    ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.routerPush).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBeNull()
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'shell.composer.limit.reason:{"allowance":5}',
    })
    expect(composer.current.canRetryLastSend).toBe(false)
  })

  it('blocks sending and surfaces the offline title when offline', async () => {
    const composer = await renderComposer({ isOnline: false, offlineTitle: 'You are offline' })

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.openChatStream).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('shell.composer.offline.reason')
    expect(composer.current.composerProps.state).toBe('offline')
    expect(composer.current.composerProps.words.placeholder).toBe('shell.composer.offline.placeholder')
    expect(composer.current.composerProps.words.inputLabel).toBe('shell.composer.inputLabel')
  })

  it('aborts an idle stream at the watchdog and arms retry with the timeout copy', async () => {
    vi.useFakeTimers()
    try {
      mocks.openChatStream.mockImplementation(
        (_formData: FormData, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            })
          }),
      )
      const composer = await renderComposer()

      await TestRenderer.act(async () => {
        const sendPromise = composer.current.sendMessage('hello')
        await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS)
        await sendPromise
      })

      expect(composer.current.sendError).toBe('chat.timeoutError')
      expect(composer.current.canRetryLastSend).toBe(true)
      expect(useChatStore.getState().isTyping).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries the failed send without duplicating the user message', async () => {
    mocks.openChatStream
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"started"}'),
        frame('{"type":"step","domain":"habits","access":"read"}'),
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"delta","text":"Recovered"}'),
        finalFrame(makeChatResponse({ aiMessage: 'Recovered' })),
      ))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('log water')
    })
    expect(composer.current.canRetryLastSend).toBe(true)
    expect(composer.current.activeSteps).toEqual([])
    expect(useChatStore.getState().messages.every((message) => !message.toolSteps?.length)).toBe(true)

    await TestRenderer.act(async () => {
      await composer.current.retryLastSend()
    })

    const messages = useChatStore.getState().messages
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({ role: 'ai', content: 'Recovered' })
    expect(composer.current.canRetryLastSend).toBe(false)
    expect(composer.current.sendError).toBeNull()
  })

  it('clears an untouched restored draft after a successful retry', async () => {
    mocks.openChatStream
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()

    TestRenderer.act(() => composer.current.setInput('log water'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })
    expect(composer.current.composerProps.value).toBe('log water')

    await TestRenderer.act(async () => {
      await composer.current.retryLastSend()
    })

    expect(composer.current.composerProps.value).toBe('')
  })

  it('keeps a same-valued newer edit while a successful retry finishes invalidating', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    mocks.openChatStream
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseStreamResponse(finalFrame(makeChatResponse({
        operations: [{
          operationId: 'operation-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
        }],
      }))))
    const composer = await renderComposer()

    TestRenderer.act(() => composer.current.setInput('log water'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })

    let retryPromise!: Promise<void>
    TestRenderer.act(() => {
      retryPromise = composer.current.retryLastSend()
    })
    await vi.waitFor(() => expect(composer.current.isSending).toBe(false))
    TestRenderer.act(() => composer.current.setInput('log water'))

    await TestRenderer.act(async () => {
      resolveInvalidations()
      await retryPromise
    })

    expect(composer.current.composerProps.value).toBe('log water')
  })

  it('keeps a same-valued draft restored by a fast repeat send failure', async () => {
    let resolveInvalidations!: () => void
    const invalidations = new Promise<void>((resolve) => {
      resolveInvalidations = resolve
    })
    mocks.queryClient.invalidateQueries.mockReturnValue(invalidations)
    mocks.openChatStream
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseStreamResponse(finalFrame(makeChatResponse({
        operations: [{
          operationId: 'operation-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
        }],
      }))))
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"error","status":500,"error":"boom again"}'),
      ))
    const composer = await renderComposer()

    TestRenderer.act(() => composer.current.setInput('log water'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })

    let retryPromise!: Promise<void>
    TestRenderer.act(() => {
      retryPromise = composer.current.retryLastSend()
    })
    await vi.waitFor(() => expect(composer.current.isSending).toBe(false))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })
    expect(composer.current.composerProps.value).toBe('log water')

    await TestRenderer.act(async () => {
      resolveInvalidations()
      await retryPromise
    })

    expect(composer.current.composerProps.value).toBe('log water')
  })

  it('keeps a newer draft edit when an in-flight retry fails', async () => {
    const retryStream = controlledSseStreamResponse()
    mocks.openChatStream
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(retryStream.response)
    const composer = await renderComposer()

    TestRenderer.act(() => composer.current.setInput('log water'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })

    let retryPromise!: Promise<void>
    TestRenderer.act(() => {
      retryPromise = composer.current.retryLastSend()
    })
    TestRenderer.act(() => composer.current.setInput('log water and vitamins'))

    await TestRenderer.act(async () => {
      retryStream.enqueue(frame('{"type":"error","status":500,"error":"boom again"}'))
      retryStream.close()
      await retryPromise
    })

    expect(composer.current.composerProps.value).toBe('log water and vitamins')
  })

  it('keeps an intentionally cleared draft when its retry fails', async () => {
    mocks.openChatStream
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"error","status":500,"error":"boom"}'),
      ))
      .mockResolvedValueOnce(sseStreamResponse(
        frame('{"type":"error","status":500,"error":"boom again"}'),
      ))
    const composer = await renderComposer()

    TestRenderer.act(() => composer.current.setInput('log water'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })
    expect(composer.current.composerProps.value).toBe('log water')

    TestRenderer.act(() => composer.current.setInput(''))
    await TestRenderer.act(async () => {
      await composer.current.retryLastSend()
    })

    expect(composer.current.composerProps.value).toBe('')
  })

  it('confirms then executes a pending operation through the API', async () => {
    mocks.apiClient
      .mockResolvedValueOnce({ confirmationToken: 'token-1' })
      .mockResolvedValueOnce({
        operation: {
          operationId: 'op-1',
          sourceName: 'CreateHabit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          status: 'Succeeded',
          summary: 'Created',
        },
      })
    const composer = await renderComposer()

    let result: Awaited<ReturnType<ComposerApi['confirmAndExecutePendingOperation']>> | null = null
    await TestRenderer.act(async () => {
      result = await composer.current.confirmAndExecutePendingOperation('pending-1')
    })

    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      1,
      API.ai.pendingOperationConfirm('pending-1'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      2,
      API.ai.pendingOperationExecute('pending-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmationToken: 'token-1' }),
      }),
    )
    expect(result).toMatchObject({ ok: true })
    expect(useChatStore.getState().messages).toHaveLength(0)
  })

  it('selects a valid image from the library and lets it be removed', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(composer.current.selectedImage?.uri).toBe('file:///pic.jpg')
    expect(composer.current.imagePreview).toBe('file:///pic.jpg')
    expect(composer.current.sendError).toBeNull()

    await TestRenderer.act(() => {
      composer.current.removeImage()
    })
    expect(composer.current.selectedImage).toBeNull()
    expect(composer.current.imagePreview).toBeNull()
  })

  it('submits a selected image with nonblank text', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })
    TestRenderer.act(() => composer.current.setInput('log my walk'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })

    expect(mocks.openChatStream).toHaveBeenCalledOnce()
    expect(appendFormPart).toHaveBeenCalledWith('message', 'log my walk')
    expect(appendFormPart).toHaveBeenCalledWith('image', expect.any(Blob), 'pic.jpg')
    appendFormPart.mockRestore()
  })

  it('reads a valid text file, folds it into the sent message, and clears it', async () => {
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset()],
    })
    mocks.readFileText.mockResolvedValue('Walk\nRead')
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledOnce())
    })
    expect(composer.current.selectedTextFile).toEqual({
      name: 'notes.txt',
      content: 'Walk\nRead',
    })

    TestRenderer.act(() => composer.current.setInput('Import these'))
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })

    expect(appendFormPart).toHaveBeenCalledWith(
      'message',
      'Import these\n\nchat.fileAttached:{"name":"notes.txt"}\nWalk\nRead',
    )
    expect(composer.current.selectedTextFile).toBeNull()
    appendFormPart.mockRestore()
  })

  it('rejects an unsupported text-file extension', async () => {
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset({ name: 'notes.pdf', uri: 'file:///notes.pdf' })],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.getDocumentAsync).toHaveBeenCalledOnce())
    })

    expect(composer.current.sendError).toBe('chat.fileError')
    expect(composer.current.selectedTextFile).toBeNull()
    expect(mocks.readFileText).not.toHaveBeenCalled()
  })

  it('rejects a text file over 1 MiB', async () => {
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset({ size: 1024 * 1024 + 1 })],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.getDocumentAsync).toHaveBeenCalledOnce())
    })

    expect(composer.current.sendError).toBe('chat.fileSizeError')
    expect(composer.current.selectedTextFile).toBeNull()
    expect(mocks.readFileText).not.toHaveBeenCalled()
  })

  it('rejects a text file over 1 MiB when the picker omits its size', async () => {
    mocks.fileSize = 1024 * 1024 + 1
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset()],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.getDocumentAsync).toHaveBeenCalledOnce())
    })

    expect(composer.current.sendError).toBe('chat.fileSizeError')
    expect(composer.current.selectedTextFile).toBeNull()
    expect(mocks.readFileText).not.toHaveBeenCalled()
  })

  it('reads a small text file when the picker omits its size', async () => {
    mocks.fileSize = 2048
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset()],
    })
    mocks.readFileText.mockResolvedValue('Walk\nRead')
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledOnce())
    })

    expect(composer.current.sendError).toBeNull()
    expect(composer.current.selectedTextFile).toEqual({
      name: 'notes.txt',
      content: 'Walk\nRead',
    })
  })

  it('surfaces a text-file read failure', async () => {
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset({ name: 'notes.md', uri: 'file:///notes.md' })],
    })
    mocks.readFileText.mockRejectedValue(new Error('read failed'))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledOnce())
    })

    expect(composer.current.sendError).toBe('chat.fileReadError')
    expect(composer.current.selectedTextFile).toBeNull()
  })

  it('does nothing when the document picker is canceled', async () => {
    mocks.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.getDocumentAsync).toHaveBeenCalledOnce())
    })

    expect(composer.current.sendError).toBeNull()
    expect(composer.current.selectedTextFile).toBeNull()
    expect(mocks.readFileText).not.toHaveBeenCalled()
  })

  it('removes text-file and image attachments independently by id', async () => {
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset()],
    })
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledOnce())
      await composer.current.openFilePicker()
    })
    expect(composer.current.composerProps.attachments).toHaveLength(2)

    TestRenderer.act(() => composer.current.composerProps.onAttachRemove?.('chat-file'))
    expect(composer.current.selectedTextFile).toBeNull()
    expect(composer.current.selectedImage?.fileName).toBe('pic.jpg')

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledTimes(2))
    })
    TestRenderer.act(() => composer.current.composerProps.onAttachRemove?.('chat-image'))
    expect(composer.current.selectedTextFile?.name).toBe('notes.txt')
    expect(composer.current.selectedImage).toBeNull()
  })

  it('allows a file-only send and blocks an image-only send', async () => {
    mocks.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [documentPickerAsset()],
    })
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      composer.current.composerProps.onAttachFile?.()
      await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledOnce())
    })
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })
    expect(mocks.openChatStream).toHaveBeenCalledOnce()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })
    await TestRenderer.act(async () => {
      await composer.current.sendMessage()
    })
    expect(mocks.openChatStream).toHaveBeenCalledOnce()
  })

  it('blocks image selection when the media-library permission is denied', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(mocks.launchImageLibraryAsync).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('chat.imagePermissionError')
    expect(composer.current.selectedImage).toBeNull()
  })

  it('rejects an unsupported image type with the type error copy', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///doc.pdf', mimeType: 'application/pdf', fileName: 'doc.pdf', fileSize: 2048 },
      ],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(composer.current.sendError).toBe('chat.imageError')
    expect(composer.current.selectedImage).toBeNull()
  })

  it('does nothing when the image picker is canceled', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(composer.current.selectedImage).toBeNull()
    expect(composer.current.sendError).toBeNull()
  })

  it('keeps the speech error visible after its former timeout', async () => {
    vi.useFakeTimers()
    mocks.state.speechError = 'mic failed'
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await Promise.resolve()
    })

    expect(composer.current.composerProps.errorMessage).toBe('mic failed')
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(composer.current.composerProps.errorMessage).toBe('mic failed')
  })

  it('formats the recording duration as m:ss', async () => {
    mocks.state.recordingDuration = 65
    const composer = await renderComposer()

    expect(composer.current.recordingTime).toBe('1:05')
  })

  it('flags the AI message limit for a capped non-pro user', async () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
    })
    const composer = await renderComposer()

    expect(composer.current.atMessageLimit).toBe(true)
    expect(composer.current.showSuggestions).toBe(false)
  })

  it.each([4, 5, 6])('shows the empty invitation only below the daily limit with %s messages used', async (aiMessagesUsed) => {
    mocks.state.profile = createMockProfile({ aiMessagesUsed, aiMessagesLimit: 5 })
    function Harness() {
      const chat = useChatComposer({ isOnline: true, offlineTitle: 'Offline' })
      return <Conversation chat={chat} />
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Harness />)
      mountedTrees.push(tree)
      await Promise.resolve()
    })
    const texts = visibleMessageTexts(tree)
    const suggestionGroups = tree.root.findAll((node: { type: unknown; props: { accessibilityLabel?: string } }) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === 'shell.composer.suggestionsLabel')

    expect(useChatStore.getState().messages).toEqual([])
    if (aiMessagesUsed < 5) {
      expect(texts).toContain('chat.empty.title')
      expect(texts).toContain('aiDisclosure.notMedicalAdvice')
      expect(suggestionGroups).toHaveLength(1)
    } else {
      expect(texts).not.toContain('chat.empty.title')
      expect(suggestionGroups).toHaveLength(0)
      expect(texts.filter(text => text === 'shell.composer.limit.reason:{"allowance":5}')).toHaveLength(1)
    }
  })

  it('states only the allowance at the message limit', async () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
      timeZone: 'America/New_York',
    })

    const composer = await renderComposer()
    expect(composer.current.composerProps.limitReason).toBe(
      'shell.composer.limit.reason:{"allowance":20}',
    )
    expect(composer.current.composerProps.limitReason).not.toContain('resetsAt')
    expect(composer.current.composerProps.limitReason).not.toContain('midnight')
  })

  it('shares a selected Today draft with a newly mounted conversation composer', async () => {
    const todayComposer = await renderComposer()

    await TestRenderer.act(() => {
      todayComposer.current.setInput('Help me create a morning walk habit')
    })
    const conversationComposer = await renderComposer()

    expect(conversationComposer.current.composerProps.value).toBe(
      'Help me create a morning walk habit',
    )
  })

  it('ignores an empty send with nothing typed or attached', async () => {
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('   ')
    })

    expect(mocks.openChatStream).not.toHaveBeenCalled()
    expect(useChatStore.getState().messages).toHaveLength(0)
  })

  it('ignores a send while the assistant is already typing', async () => {
    useChatStore.setState({ isTyping: true })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('hello')
    })

    expect(mocks.openChatStream).not.toHaveBeenCalled()
    expect(composer.current.sendError).toBe('shell.composer.busy.reason')
  })

  it.each([
    [false, 5],
    [true, 50],
  ])('enforces the daily allowance for free and Pro, pro=%s', async (hasProAccess, allowance) => {
    mocks.state.profile = createMockProfile({
      hasProAccess,
      aiMessagesUsed: allowance,
      aiMessagesLimit: allowance,
    })
    const composer = await renderComposer()

    expect(composer.current.atMessageLimit).toBe(true)
    expect(composer.current.composerProps.limitReason).toBe(
      `shell.composer.limit.reason:{"allowance":${allowance}}`,
    )
  })

  it('shows the daily allowance instead of sending when the account is already at its limit', async () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 5,
      aiMessagesLimit: 5,
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('plan my morning')
    })

    expect(mocks.openChatStream).not.toHaveBeenCalled()
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      role: 'ai',
      content: 'shell.composer.limit.reason:{"allowance":5}',
    })
    expect(composer.current.sendError).toBeNull()
  })

  it('commits a finished voice transcript after the current draft', async () => {
    mocks.state.isRecording = true
    mocks.state.transcript = 'walked outside'
    const composer = await renderComposer()

    TestRenderer.act(() => composer.current.setInput('I'))
    mocks.state.isRecording = false
    composer.rerender()

    expect(composer.current.composerProps.value).toBe('I walked outside')
  })

  it('omits the voice control when speech is unavailable at the account limit', async () => {
    mocks.state.speechSupported = false
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      aiMessagesUsed: 20,
      aiMessagesLimit: 20,
    })

    const composer = await renderComposer()

    expect(composer.current.composerProps.state).toBe('atLimit')
    expect(composer.current.composerProps.words.placeholder).toBe('shell.composer.limit.placeholder')
    expect(composer.current.composerProps.onVoice).toBeUndefined()
  })

  it('explains the connection first when offline at the account limit', async () => {
    mocks.state.profile = createMockProfile({ hasProAccess: false, aiMessagesUsed: 20, aiMessagesLimit: 20 })
    const composer = await renderComposer({ isOnline: false })
    expect(composer.current.composerProps.state).toBe('offline')
    expect(composer.current.composerProps.limitReason).toBe('shell.composer.offline.reason')
  })

  it('keeps an active recording stoppable and explains a lost connection', async () => {
    mocks.state.isRecording = true
    const composer = await renderComposer({ isOnline: false })
    expect(composer.current.composerProps.state).toBe('recording')
    expect(composer.current.composerProps.words.offlineReason).toBe('shell.composer.offline.reason')
    expect(composer.current.composerProps.onVoice).toBe(mocks.toggleRecording)
  })

  it('rejects an oversized image with the size error copy', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///large.png',
          mimeType: 'image/png',
          fileName: 'large.png',
          fileSize: 21 * 1024 * 1024,
        },
      ],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })

    expect(composer.current.sendError).toBe('chat.imageSizeError')
    expect(composer.current.selectedImage).toBeNull()
  })

  it('keeps a failed request queued when retry is attempted offline', async () => {
    mocks.openChatStream.mockRejectedValueOnce(new Error('network unavailable'))
    const options = { isOnline: true, offlineTitle: 'offline sentinel' }
    const composer = await renderComposer(options)

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('log water')
    })
    expect(composer.current.canRetryLastSend).toBe(true)

    options.isOnline = false
    composer.rerender()
    await TestRenderer.act(async () => {
      await composer.current.retryLastSend()
    })

    expect(composer.current.sendError).toBe('offline sentinel')
    expect(mocks.openChatStream).toHaveBeenCalledTimes(1)
  })

  it('queries the selected day with the visible Today general filter', async () => {
    await renderComposer({ pathname: '/', today: '2026-09-12', selectedDate: '2026-09-11', includeGeneral: true })
    expect(mocks.state.habitFilters.at(-1)).toMatchObject({
      dateFrom: '2026-09-11', dateTo: '2026-09-11', includeOverdue: false, includeGeneral: true,
    })
  })

  it('matches the shared chip builder on primary routes', async () => {
    const habit = createMockHabit({ title: 'Read', linkedGoals: [], isCompleted: false })
    mocks.state.profile = createMockProfile({ lastCompletionDate: null, currentStreak: 0, longestStreak: 0, aiSummaryEnabled: true, hasGoogleConnection: true })
    mocks.state.habitData = { topLevelHabits: [habit], totalCount: 1 }
    for (const [pathname, surface] of [['/', 'today'], ['/calendar', 'calendar'], ['/progress', 'progress'], ['/profile', 'profile']] as const) {
      const expected = buildComposerChips({ surface, status: 'success', habits: [habit], totalHabitCount: 1, profile: mocks.state.profile }).map((chip) => chip.id)
      const composer = await renderComposer({ pathname })
      expect(composer.current.composerProps.suggestions.map((chip) => chip.id)).toEqual(expected)
      composer.unmount()
    }
  })

  it('gates Calendar chips on the Calendar error rather than the Today query', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = null
    const composer = await renderComposer({ pathname: '/calendar' })
    expect(composer.current.composerProps.suggestions.map((chip) => chip.id)).toEqual([
      'today.logYesterday', 'calendar.slippedThisWeek', 'today.changeTimes',
    ])
    await TestRenderer.act(async () => {
      useUIStore.getState().setCalendarHasError(true)
      await Promise.resolve()
    })
    expect(composer.current.composerProps.suggestions).toEqual([])
  })

  it('queries every habit when choosing Progress goal chips', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    await renderComposer({ pathname: '/progress' })
    expect(mocks.state.habitFilters.at(-1)).toEqual({})
  })

  it('sends a live suggestion label as the transport message', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    const composer = await renderComposer()
    const suggestion = composer.current.composerProps.suggestions[0]!

    TestRenderer.act(() => suggestion.onSelect())
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())

    expect(appendFormPart).toHaveBeenCalledWith('message', suggestion.label)
    appendFormPart.mockRestore()
  })

  it.each(['moveOverdue', 'logHabit', 'trimHabit', 'keepOnlyHabit', 'reviewHabit', 'createGoal'])('sends the complete habit title behind the short %s label', async action => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    const title = 'Read a chapter with "quotes" and accents á '.repeat(5)
    const habit = createMockHabit({ title, isOverdue: true, hasSubHabits: true, isCompleted: action === 'reviewHabit' })
    mocks.state.habitData = { topLevelHabits: [habit], totalCount: 1 }
    mocks.state.profile = createMockProfile({ lastCompletionDate: action === 'keepOnlyHabit' ? '2026-09-08' : null })
    const surface = action === 'createGoal' ? 'progress' : 'today'
    const composer = await renderComposer({ pathname: surface === 'progress' ? '/progress' : '/' })
    const suggestion = composer.current.composerProps.suggestions.find(chip => chip.id === `${surface}.${action}`)!
    expect(suggestion.label).toBe(`shell.composer.chips.${surface}.${action}`)
    TestRenderer.act(() => suggestion.onSelect())
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    expect(appendFormPart).toHaveBeenCalledWith('message', `shell.composer.prompts.${surface}.${action}:${JSON.stringify({ title })}`)
    appendFormPart.mockRestore()
  })

  it('keeps a Progress goal request available beside an existing draft', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    useChatStore.setState({ draft: 'Unsent note', contextualSuggestion: {
      id: 'progress-create-goal', label: 'Create a goal', prompt: 'Help me make a goal',
    } })
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    const composer = await renderComposer({ pathname: '/progress' })
    expect(composer.current.composerProps.suggestions[0]?.id).toBe('progress-create-goal')
    TestRenderer.act(() => composer.current.composerProps.suggestions[0]?.onSelect())
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    expect(appendFormPart).toHaveBeenCalledWith('message', 'Help me make a goal')
    expect(useChatStore.getState().draft).toBe('Unsent note')
    appendFormPart.mockRestore()
  })

  it.each(['loading', 'error'] as const)('selects the requested Progress goal beside an existing draft while habits are %s', async status => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = null
    mocks.state.habitsError = status === 'error'
    useChatStore.getState().setDraft('Unsent note')
    prepareChatRequest(useChatStore.getState(), {
      id: 'progress-create-goal', label: 'Create a goal', prompt: 'Help me make a goal',
    })
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    onTestFinished(() => appendFormPart.mockRestore())
    function GoalRequestComposer() {
      const chat = useChatComposer({ pathname: '/progress', isOnline: true, offlineTitle: 'offline' })
      return <ShellComposer {...chat.composerProps} />
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<GoalRequestComposer />)
      mountedTrees.push(tree)
      await Promise.resolve()
    })
    expect(tree.root.findByType('TextInput').props.value).toBe('Unsent note')
    const group = tree.root.findByProps({ accessibilityLabel: 'shell.composer.suggestionsLabel' })
    const chips = group.findAllByType('Pressable')
    expect(chips.length).toBeGreaterThanOrEqual(3)
    expect(chips[0].props.accessibilityLabel).toBe('Create a goal')
    TestRenderer.act(() => chips[0].props.onPress())
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    expect(appendFormPart).toHaveBeenCalledWith('message', 'Help me make a goal')
    expect(tree.root.findByType('TextInput').props.value).toBe('Unsent note')
    expect(useChatStore.getState().draft).toBe('Unsent note')
  })

  it('uses loaded habit detail while the separate day query is unavailable', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.habitData = null
    mocks.state.detail = makeHabitDetail()
    const composer = await renderComposer({ pathname: '/habits/habit-1' })
    expect(composer.current.composerProps.suggestions.map((chip) => chip.id)).toEqual([
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
    await i18n.changeLanguage(locale)
    mocks.translate = i18n.t.bind(i18n)
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = { ...makeHabitDetail(), title: 'Ler' }
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    onTestFinished(() => appendFormPart.mockRestore())
    const composer = await renderComposer({ pathname: '/habits/habit-1' })
    const suggestion = composer.current.composerProps.suggestions.find(chip => chip.id === `habitDetail.${action}`)!
    expect(suggestion.label).toBe(label)
    TestRenderer.act(() => suggestion.onSelect())
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    expect(appendFormPart).toHaveBeenCalledWith('message', expect.stringContaining('Ler'))
    expect(appendFormPart).toHaveBeenCalledWith('message', prompt)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('sends the first habit detail chip as a pause request', async () => {
    mocks.state.profile = createMockProfile({ lastCompletionDate: null })
    mocks.state.detail = makeHabitDetail()
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse())))
    const appendFormPart = vi.spyOn(FormData.prototype, 'append')
    const composer = await renderComposer({ pathname: '/habits/habit-1' })
    const suggestion = composer.current.composerProps.suggestions[0]!
    expect(suggestion.id).toBe('habitDetail.pauseThisWeek')
    TestRenderer.act(() => suggestion.onSelect())
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    expect(appendFormPart).toHaveBeenCalledWith('message', 'shell.composer.prompts.habitDetail.pauseThisWeek:{"title":"Read"}')
    appendFormPart.mockRestore()
  })

  it('refreshes the habit list after a confirmed breakdown', async () => {
    const composer = await renderComposer()

    composer.current.handleBreakdownConfirmed()

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.searches() })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.lists(),
    })
  })

  it('refreshes the returning profile after a successful live log action', async () => {
    mocks.openChatStream.mockResolvedValue(sseStreamResponse(finalFrame(makeChatResponse({
      actions: [{ type: 'LogHabit', status: 'Success' }],
    }))))
    const composer = await renderComposer()

    await TestRenderer.act(async () => { await composer.current.sendMessage('log water') })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })

  it('disarms the previous account retry and attachments when the account changes', async () => {
    mocks.openChatStream.mockRejectedValueOnce(new Error('network unavailable'))
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    const composer = await renderComposer()
    useUIStore.getState().setAstraConversationOpen(true, 'support')

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('cancel my 9pm meds reminder')
    })
    expect(composer.current.canRetryLastSend).toBe(true)

    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })
    expect(composer.current.selectedImage).not.toBeNull()

    TestRenderer.act(() => advanceAccountGeneration())

    expect(composer.current.canRetryLastSend).toBe(false)
    expect(composer.current.selectedImage).toBeNull()
    expect(composer.current.imagePreview).toBeNull()
    expect(useUIStore.getState().astraEntryPointIntent).toBeUndefined()
  })

  it.each([
    ['final', finalFrame(makeChatResponse({ aiMessage: 'Account A answer' }))],
    ['failure', frame('{"type":"error","error":"Account A failed","status":500}')],
  ])('discards a late %s stream after account replacement', async (_, outcome) => {
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const composer = await renderComposer()

    let send!: Promise<void>
    TestRenderer.act(() => { send = composer.current.sendMessage('Account A prompt') })
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    TestRenderer.act(() => stream.enqueue(frame('{"type":"step","domain":"habits","access":"read"}')))
    await vi.waitFor(() => expect(composer.current.activeSteps).toHaveLength(1))

    await TestRenderer.act(async () => {
      await useChatStore.getState().resetAccountScopedChat()
      advanceAccountGeneration()
      useChatStore.getState().setDraft('Account B draft')
    })
    await TestRenderer.act(async () => {
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
    expect(composer.current.canRetryLastSend).toBe(false)
    expect(composer.current.sendError).toBeNull()
    expect(composer.current.activeSteps).toEqual([])
  })

  it('finishes a live stream when only the session epoch changes', async () => {
    const stream = controlledSseStreamResponse()
    mocks.openChatStream.mockResolvedValue(stream.response)
    const composer = await renderComposer()

    let send!: Promise<void>
    TestRenderer.act(() => { send = composer.current.sendMessage('Keep this send') })
    await vi.waitFor(() => expect(mocks.openChatStream).toHaveBeenCalledOnce())
    TestRenderer.act(() => advanceSessionEpoch())
    await TestRenderer.act(async () => {
      stream.enqueue(finalFrame(makeChatResponse({ aiMessage: 'Still yours' })))
      stream.close()
      await send
    })

    expect(useChatStore.getState().messages.at(-1)?.content).toBe('Still yours')
    expect(mocks.queryClient.setQueryData).toHaveBeenCalledOnce()
  })

  it('discards a text file read after account replacement', async () => {
    mocks.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [documentPickerAsset()] })
    let finishRead!: (content: string) => void
    mocks.readFileText.mockReturnValueOnce(new Promise<string>((resolve) => { finishRead = resolve }))
    const composer = await renderComposer()

    TestRenderer.act(() => composer.current.composerProps.onAttachFile?.())
    await vi.waitFor(() => expect(mocks.readFileText).toHaveBeenCalledOnce())
    TestRenderer.act(() => advanceAccountGeneration())
    await TestRenderer.act(async () => {
      finishRead('Account A secret')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(composer.current.selectedTextFile).toBeNull()
    expect(composer.current.sendError).toBeNull()
  })

  it('discards an image picker result after account replacement', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    let finishPicker!: (result: unknown) => void
    mocks.launchImageLibraryAsync.mockReturnValueOnce(new Promise((resolve) => {
      finishPicker = resolve
    }))
    const composer = await renderComposer()

    let pick!: Promise<void>
    TestRenderer.act(() => { pick = composer.current.openFilePicker() })
    await vi.waitFor(() => expect(mocks.launchImageLibraryAsync).toHaveBeenCalledOnce())
    TestRenderer.act(() => advanceAccountGeneration())
    await TestRenderer.act(async () => {
      finishPicker({
        canceled: false,
        assets: [{ uri: 'file:///account-a.jpg', mimeType: 'image/jpeg', fileName: 'account-a.jpg', fileSize: 2048 }],
      })
      await pick
    })

    expect(composer.current.selectedImage).toBeNull()
    expect(composer.current.imagePreview).toBeNull()
    expect(composer.current.sendError).toBeNull()
  })

  it('keeps the retry and the attachment when only the session epoch moves', async () => {
    mocks.openChatStream.mockRejectedValueOnce(new Error('network unavailable'))
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    mocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///pic.jpg', mimeType: 'image/jpeg', fileName: 'pic.jpg', fileSize: 2048 },
      ],
    })
    const composer = await renderComposer()

    await TestRenderer.act(async () => {
      await composer.current.sendMessage('cancel my 9pm meds reminder')
    })
    await TestRenderer.act(async () => {
      await composer.current.openFilePicker()
    })
    expect(composer.current.canRetryLastSend).toBe(true)
    expect(composer.current.selectedImage).not.toBeNull()

    TestRenderer.act(() => advanceSessionEpoch())

    expect(composer.current.canRetryLastSend).toBe(true)
    expect(composer.current.selectedImage).not.toBeNull()
  })

  it('reads the draft back and keeps saving it after an account reset', async () => {
    const getItem = vi.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null)
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem').mockResolvedValue(undefined)
    onTestFinished(() => {
      getItem.mockRestore()
      setItem.mockRestore()
      removeItem.mockRestore()
    })
    useChatStore.setState({ draftHydrated: false })
    const composer = await renderComposer()

    await vi.waitFor(() => expect(getItem).toHaveBeenCalledTimes(1))

    await TestRenderer.act(async () => {
      await useChatStore.getState().resetAccountScopedChat()
    })
    await vi.waitFor(() => expect(getItem).toHaveBeenCalledTimes(2))

    TestRenderer.act(() => composer.current.setInput('log water'))

    expect(setItem).toHaveBeenCalledWith(CHAT_DRAFT_STORAGE_KEY, 'log water')
  })
})
