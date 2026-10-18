import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { createMockProfile, createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import type { ProactiveItem } from '@orbit/shared/types'
import { TodayAstra } from '@/components/today/today-astra'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
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
vi.mock('@/hooks/use-summary', () => ({ useSummary: (options: unknown) => {
  mocks.query(options)
  return { summary: mocks.summary, isLoading: mocks.isLoading, isFetching: mocks.isFetching, error: mocks.error, refetch: mocks.refetch }
} }))
const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer & { unmount: () => void }
async function mount(overrides: { isTodaySelected?: boolean; suppressed?: boolean } = {}) {
  let tree!: Tree
  await TestRenderer.act(() => { tree = TestRenderer.create(<TodayAstra today="2026-08-29" isTodaySelected suppressed={false} {...overrides} />) as Tree })
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

  it('opens the whole summary first, preserves the thread and draft, and reuses its message', async () => {
    useChatStore.getState().addMessage({ id: 'earlier', role: 'user', content: 'Earlier conversation', timestamp: new Date() })
    const tree = await mount()
    expect(slot(tree)[0]!.props.accessibilityLabel).toBe('Seu dia começou com uma caminhada.')
    expect(StyleSheet.flatten(slot(tree)[0]!.props.style)).toMatchObject({ minHeight: 48 })
    await press(tree)
    await press(tree)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'ai', content: mocks.summary }),
      expect.objectContaining({ id: 'earlier' }),
    ])
    expect(useChatStore.getState().draft).toBe('Keep my draft')
    expect(useChatStore.getState().proactiveEntryId).toBe('daily-summary-2026-08-29')
    expect(mocks.query).toHaveBeenCalledWith({ date: '2026-08-29', locale: 'pt-BR', timeZone: 'America/Sao_Paulo', hasProAccess: true, aiSummaryEnabled: true })
    await TestRenderer.act(() => tree.unmount())
  })

  it.each(['loading', 'error', 'retrying', 'refreshing', 'free', 'disabled', 'none', 'no profile', 'past', 'suppressed'])('keeps %s in the same slot', async (state) => {
    const { absent, sentence } = configureSummaryState(state)
    const tree = await mount({ isTodaySelected: state !== 'past', suppressed: state === 'suppressed' })
    expect(slot(tree)).toHaveLength(absent ? 0 : 1)
    if (!absent) {
      expect(slot(tree)[0]!.props.accessibilityLabel).toBe(sentence)
      expect(slot(tree)[0]!.props.accessibilityState).toEqual({ busy: mocks.isLoading || mocks.isFetching, disabled: ['loading', 'retrying'].includes(state) })
      if (state === 'error') { await press(tree); expect(mocks.refetch).toHaveBeenCalledOnce() }
      if (state === 'free') { await press(tree); expect(mocks.upgrade).toHaveBeenCalledWith('/upgrade') }
    }
    await TestRenderer.act(() => tree.unmount())
  })
})
