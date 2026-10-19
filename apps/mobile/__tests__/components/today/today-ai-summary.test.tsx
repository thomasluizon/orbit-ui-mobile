import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { TodayAISummary } from '@/components/today/today-ai-summary'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'

const mocks = vi.hoisted(() => ({
  profile: undefined as ReturnType<typeof createMockProfile> | undefined,
  summary: null as string | null,
  isLoading: false,
  isFetching: false,
  error: null as Error | null,
  refetch: vi.fn(),
  useSummary: vi.fn(),
  push: vi.fn(),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'pt-BR' } }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-summary', () => ({ useSummary: (options: unknown) => {
  mocks.useSummary(options)
  return mocks
} }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type SummaryTree = ReturnType<typeof TestRenderer.create> & { unmount: () => void; toJSON: () => unknown }
async function renderSummary() {
  let tree!: SummaryTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<TodayAISummary date="2026-08-29" />) as SummaryTree })
  return tree
}
function action(tree: SummaryTree, label: string) {
  return tree.root.findAll((node) => typeof node.type === 'string' && !!node.props.accessibilityRole && (node.props.accessibilityLabel === label || node.findAll((child) => child.props.children === label).length > 0))[0]!
}
function hasText(tree: SummaryTree, text: string) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.children === text).length > 0
}
async function press(tree: SummaryTree, label: string) {
  const target = action(tree, label)
  if (!target.props.disabled) await TestRenderer.act(() => (target.props.onPress as () => void)())
}

beforeEach(() => {
  mocks.profile = createMockProfile({ hasProAccess: true, aiSummaryEnabled: true, language: 'en', timeZone: 'America/Sao_Paulo' })
  mocks.summary = 'A short daily summary.'
  mocks.isLoading = false
  mocks.isFetching = false
  mocks.error = null
  mocks.refetch.mockReset()
  mocks.useSummary.mockClear()
  mocks.push.mockClear()
  useChatStore.setState({ messages: [], proactiveEntryId: null })
  useUIStore.setState({ astraConversationOpen: false })
})

describe('daily summary on Hoje', () => {
  it('fetches the account day and opens the full-screen Astra conversation', async () => {
    const tree = await renderSummary()
    try {
      expect(hasText(tree, 'A short daily summary.')).toBe(true)
      expect(hasText(tree, 'aiDisclosure.notMedicalAdvice')).toBe(false)
      expect(mocks.useSummary).toHaveBeenCalledWith({ date: '2026-08-29', locale: 'en', timeZone: 'America/Sao_Paulo', hasProAccess: true, aiSummaryEnabled: true })
      await press(tree, 'A short daily summary.')
      expect(useUIStore.getState().astraConversationOpen).toBe(true)
      expect(mocks.push).not.toHaveBeenCalled()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('opens the complete long summary through its first sentence without an expand control', async () => {
    mocks.summary = 'Your habits are ready for today. '.repeat(8)
    const tree = await renderSummary()
    try {
      expect(action(tree, 'common.seeMore')).toBeUndefined()
      expect(action(tree, 'Your habits are ready for today.').props.accessibilityHint).toBe('todayAstra.openConversation')
      await press(tree, 'Your habits are ready for today.')
      expect(useUIStore.getState().astraConversationOpen).toBe(true)
      expect(useChatStore.getState().messages[0]).toMatchObject({ role: 'ai', content: mocks.summary })
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('shows loading with the conversation action disabled', async () => {
    mocks.summary = null
    mocks.isLoading = true
    mocks.isFetching = true
    const tree = await renderSummary()
    try {
      const loading = action(tree, 'summary.loading')
      expect(loading.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
      expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'summary-skeleton')).toHaveLength(1)
      await press(tree, 'summary.loading')
      expect(useUIStore.getState().astraConversationOpen).toBe(false)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('retries errors and disables repeat requests while fetching', async () => {
    mocks.error = new Error('Unavailable')
    const tree = await renderSummary()
    try {
      expect(hasText(tree, 'summary.error')).toBe(true)
      await press(tree, 'summary.error')
      expect(mocks.refetch).toHaveBeenCalledTimes(1)
      mocks.isFetching = true
      await TestRenderer.act(() => tree.update(<TodayAISummary date="2026-08-29" />))
      expect(action(tree, 'summary.error').props.disabled).toBe(true)
      await press(tree, 'summary.error')
      expect(mocks.refetch).toHaveBeenCalledTimes(1)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('routes free accounts to Pro without requesting a summary', async () => {
    mocks.profile = createMockProfile({ hasProAccess: false })
    const tree = await renderSummary()
    try {
      await press(tree, 'summary.freePrompt')
      expect(mocks.push).toHaveBeenCalledWith('/upgrade')
      expect(mocks.useSummary).not.toHaveBeenCalled()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it.each(['disabled', 'profile pending'])('withholds the summary when %s', async (state) => {
    mocks.profile = state === 'disabled' ? createMockProfile({ hasProAccess: true, aiSummaryEnabled: false }) : undefined
    const tree = await renderSummary()
    try {
      expect(tree.toJSON()).toBeNull()
      expect(mocks.useSummary).not.toHaveBeenCalled()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('uses the UI language when the profile has no preference', async () => {
    mocks.profile = createMockProfile({ hasProAccess: true, aiSummaryEnabled: true, language: null })
    const tree = await renderSummary()
    try { expect(mocks.useSummary).toHaveBeenCalledWith(expect.objectContaining({ locale: 'pt-BR' })) }
    finally { await TestRenderer.act(() => tree.unmount()) }
  })
})
