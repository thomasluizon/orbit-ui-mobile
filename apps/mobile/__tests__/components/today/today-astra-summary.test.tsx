import { QueryClientProvider } from '@tanstack/react-query'
import { createApiClientError } from '@orbit/shared/utils'
import { queryClient } from '@/lib/query-client'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { createMockProfile, createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import type { ProactiveItem } from '@orbit/shared/types'
import { TodayAstra } from '@/components/today/today-astra'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  realSummary: false,
  fetchSummary: vi.fn(),
  profile: {} as ReturnType<typeof createMockProfile> | null,
  item: null as ProactiveItem | null,
  summary: null as string | null,
  isLoading: false,
  isFetching: false,
  error: null as Error | null,
  refetch: vi.fn(),
  openItem: vi.fn(),
  upgrade: vi.fn(),
  query: vi.fn(),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.upgrade, navigate: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-proactive-item', () => ({ useProactiveItem: () => ({ item: mocks.item, openItem: mocks.openItem }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: (...args: unknown[]) => mocks.fetchSummary(...args) }))
vi.mock('@/hooks/use-summary', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/use-summary')>()
  return { useSummary: (options: Parameters<typeof original.useSummary>[0]) => {
    if (mocks.realSummary) return original.useSummary(options)
    mocks.query(options)
    return { summary: mocks.summary, isLoading: mocks.isLoading, isFetching: mocks.isFetching, error: mocks.error, refetch: mocks.refetch }
  } }
})
const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer & { unmount: () => void }
async function mount(overrides: { isTodaySelected?: boolean; suppressed?: boolean } = {}) {
  let tree!: Tree
  await TestRenderer.act(() => { tree = TestRenderer.create(<TodayAstra today="2026-08-29" isTodaySelected suppressed={false} {...overrides} />) })
  return tree
}
function slot(tree: Tree) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'today-astra-slot')
}
async function press(tree: Tree) {
  await TestRenderer.act(() => (slot(tree)[0]!.props.onPress as () => void)())
}

function configureSummaryState(state: string) {
    mocks.isLoading = state === 'loading'
    mocks.isFetching = ['loading', 'retrying', 'refreshing'].includes(state)
    mocks.error = ['error', 'retrying'].includes(state) ? new Error('Unavailable') : null
    if (state === 'none') mocks.summary = null
    if (state === 'free') mocks.profile = createMockProfile({ ...mocks.profile, hasProAccess: false })
    if (state === 'disabled') mocks.profile = createMockProfile({ ...mocks.profile, aiSummaryEnabled: false })
    if (state === 'no profile') mocks.profile = null
    const absent = ['disabled', 'none', 'no profile', 'past', 'suppressed'].includes(state)
    const sentence = state === 'loading' ? 'summary.loading' : ['error', 'retrying'].includes(state) ? 'summary.error'
      : state === 'free' ? 'summary.freePrompt' : 'Seu dia começou com uma caminhada.'
  return { absent, sentence }
}

describe('Hoje single summary slot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.realSummary = false
    mocks.fetchSummary.mockReset()
    mocks.profile = createMockProfile({ hasProAccess: true, aiSummaryEnabled: true, language: 'pt-BR', timeZone: 'America/Sao_Paulo', lastCompletionDate: null })
    mocks.item = null
    mocks.summary = 'Seu dia começou com uma caminhada. Você ainda pode ler hoje.'
    mocks.isLoading = false
    mocks.isFetching = false
    mocks.error = null
    useChatStore.setState({ messages: [], proactiveEntryId: null, draft: 'Keep my draft', streamingMessageId: null })
    useUIStore.setState({ astraConversationOpen: false })
  })

  it.each(['check-in', 'returning'])('prioritizes %s over the summary without requesting it', async (state) => {
    if (state === 'check-in') mocks.item = createMockProactiveItem()
    else mocks.profile = createMockProfile({ ...mocks.profile, lastCompletionDate: '2000-01-01' })
    const tree = await mount()
    expect(slot(tree)).toHaveLength(1)
    await TestRenderer.act(() => tree.unmount())
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('opens the whole summary after the thread, preserves the draft, and reuses its message', async () => {
    useChatStore.getState().addMessage({ id: 'earlier', role: 'user', content: 'Earlier conversation', timestamp: new Date() })
    const tree = await mount()
    expect(slot(tree)[0]!.props.accessibilityLabel).toBe('Seu dia começou com uma caminhada.')
    expect(StyleSheet.flatten(slot(tree)[0]!.props.style)).toMatchObject({ minHeight: 48 })
    await press(tree)
    await press(tree)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ id: 'earlier' }),
      expect.objectContaining({ role: 'ai', content: mocks.summary }),
    ])
    expect(useChatStore.getState().draft).toBe('Keep my draft')
    expect(useChatStore.getState().proactiveEntryId).toBeNull()
    expect(mocks.query).toHaveBeenCalledWith({ date: '2026-08-29', locale: 'pt-BR', timeZone: 'America/Sao_Paulo', hasProAccess: true, aiSummaryEnabled: true })
    await TestRenderer.act(() => tree.unmount())
  })

  it.each(['loading', 'error', 'retrying', 'refreshing', 'free', 'disabled', 'none', 'no profile', 'past', 'suppressed'])('keeps %s in the same slot', async (state) => {
    const { absent, sentence } = configureSummaryState(state)
    const tree = await mount({ isTodaySelected: state !== 'past', suppressed: state === 'suppressed' })
    if (['past', 'suppressed'].includes(state)) expect(mocks.query).not.toHaveBeenCalled()
    expect(slot(tree)).toHaveLength(absent ? 0 : 1)
    if (!absent) {
      expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'summary-skeleton')).toHaveLength(state === 'loading' ? 1 : 0)
      expect(slot(tree)[0]!.props.accessibilityLabel).toBe(sentence)
      expect(slot(tree)[0]!.props.accessibilityState).toEqual({ busy: mocks.isLoading || mocks.isFetching, disabled: ['loading', 'retrying'].includes(state) })
      if (state === 'error') { await press(tree); expect(mocks.refetch).toHaveBeenCalledOnce() }
      if (state === 'free') { await press(tree); expect(mocks.upgrade).toHaveBeenCalledWith('/upgrade') }
    }
    await TestRenderer.act(() => tree.unmount())
  })

  afterEach(() => { vi.useRealTimers() })

  it.each(['quota', 'transient'] as const)('settles a real Hoje %s request with the production retry defaults', async failure => {
    vi.useFakeTimers()
    mocks.realSummary = true
    queryClient.clear()
    const error = createApiClientError(failure === 'quota' ? 424 : 500, {
      error: 'Try again later', ...(failure === 'quota' ? { errorCode: 'AI_PROVIDER_QUOTA_EXHAUSTED' } : {}),
    }, 'Unavailable')
    mocks.fetchSummary.mockRejectedValueOnce(error)
    if (failure === 'quota') mocks.fetchSummary.mockRejectedValue(error)
    else mocks.fetchSummary.mockResolvedValue({ summary: 'Your day is ready.', insight: '', fromCache: false })
    let tree!: Tree
    await TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={queryClient}><TodayAstra today="2026-08-29" isTodaySelected suppressed={false} /></QueryClientProvider>) })
    try {
      expect(slot(tree)[0]!.props.accessibilityLabel).toBe('summary.loading')
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(failure === 'quota' ? 1 : 1001) })
      if (failure === 'transient') {
        expect(slot(tree)[0]!.props.accessibilityLabel).toBe('Your day is ready.')
        expect(mocks.fetchSummary).toHaveBeenCalledTimes(2)
        return
      }
      expect(slot(tree)[0]!.props.accessibilityLabel).toBe('summary.error')
      expect(slot(tree)[0]!.props.accessibilityHint).toBe('summary.retry')
      expect(slot(tree)[0]!.props.accessibilityState).toEqual({ busy: false, disabled: false })
      expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'summary-skeleton')).toHaveLength(0)
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(mocks.fetchSummary).toHaveBeenCalledTimes(1)
      await press(tree)
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(mocks.fetchSummary).toHaveBeenCalledTimes(2)
      expect(slot(tree)[0]!.props.accessibilityLabel).toBe('summary.error')
      expect(slot(tree)[0]!.props.accessibilityState).toEqual({ busy: false, disabled: false })
    } finally { await TestRenderer.act(() => tree.unmount()); queryClient.clear() }
  })

})
