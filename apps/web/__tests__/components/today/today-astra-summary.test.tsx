import { QueryClientProvider } from '@tanstack/react-query'
import { createApiClientError } from '@orbit/shared/utils'
import { createQueryClient } from '@/lib/query-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-proactive-item', () => ({ useProactiveItem: () => ({ item: mocks.item, openItem: mocks.openItem }) }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: (...args: unknown[]) => mocks.fetchSummary(...args) }))
vi.mock('@/hooks/use-summary', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/use-summary')>()
  return { useSummary: (options: Parameters<typeof original.useSummary>[0]) => {
    if (mocks.realSummary) return original.useSummary(options)
    mocks.query(options)
    return { summary: mocks.summary, isLoading: mocks.isLoading, isFetching: mocks.isFetching, error: mocks.error, refetch: mocks.refetch }
  } }
})
function mount(overrides: { isTodaySelected?: boolean; suppressed?: boolean } = {}) {
  return render(<TodayAstra today="2026-08-29" isTodaySelected suppressed={false} {...overrides} />)
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
    const { container } = mount()
    expect(container.querySelectorAll('[data-today-astra-slot]')).toHaveLength(1)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('opens the whole summary after the thread, preserves the draft, and reuses its message', async () => {
    useChatStore.getState().addMessage({ id: 'earlier', role: 'user', content: 'Earlier conversation', timestamp: new Date() })
    const { container } = mount()
    const action = screen.getByRole('button', { name: 'Seu dia começou com uma caminhada.' })
    expect(container.querySelectorAll('button, a')).toHaveLength(1)
    expect(action).toHaveAccessibleDescription('todayAstra.openConversation')
    fireEvent.click(action)
    fireEvent.click(action)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ id: 'earlier' }),
      expect.objectContaining({ role: 'ai', content: mocks.summary }),
    ])
    expect(useChatStore.getState().draft).toBe('Keep my draft')
    expect(useChatStore.getState().proactiveEntryId).toBeNull()
    expect(mocks.query).toHaveBeenCalledWith({ date: '2026-08-29', locale: 'pt-BR', timeZone: 'America/Sao_Paulo', hasProAccess: true, aiSummaryEnabled: true })
  })

  it.each(['loading', 'error', 'retrying', 'refreshing', 'free', 'disabled', 'none', 'no profile', 'past', 'suppressed'])('keeps %s in the same slot', async (state) => {
    const { absent, sentence } = configureSummaryState(state)
    const { container } = mount({ isTodaySelected: state !== 'past', suppressed: state === 'suppressed' })
    if (['past', 'suppressed'].includes(state)) expect(mocks.query).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[data-today-astra-slot]')).toHaveLength(absent ? 0 : 1)
    if (!absent) {
      expect(container.querySelectorAll('[data-summary-skeleton]')).toHaveLength(state === 'loading' ? 1 : 0)
      const action = screen.getByRole(state === 'free' ? 'link' : 'button', { name: sentence })
      if (['loading', 'retrying'].includes(state)) expect(action).toBeDisabled()
      else expect(action).not.toBeDisabled()
      if (state === 'error') { fireEvent.click(action); expect(mocks.refetch).toHaveBeenCalledOnce() }
      if (state === 'free') expect(action).toHaveAttribute('href', '/upgrade')
      expect(container.querySelector('[data-today-astra-slot]')).toHaveAttribute('aria-busy', String(mocks.isLoading || mocks.isFetching))
    }
  })

  afterEach(() => { vi.useRealTimers() })

  it.each(['quota', 'transient'] as const)('settles a real Hoje %s request with the production retry defaults', async failure => {
    vi.useFakeTimers()
    mocks.realSummary = true
    const client = createQueryClient()
    const error = createApiClientError(failure === 'quota' ? 424 : 500, {
      error: 'Try again later', ...(failure === 'quota' ? { errorCode: 'AI_PROVIDER_QUOTA_EXHAUSTED' } : {}),
    }, 'Unavailable')
    mocks.fetchSummary.mockRejectedValueOnce(error)
    if (failure === 'quota') mocks.fetchSummary.mockRejectedValue(error)
    else mocks.fetchSummary.mockResolvedValue({ summary: 'Your day is ready.', insight: '', fromCache: false })
    const view = render(<QueryClientProvider client={client}><TodayAstra today="2026-08-29" isTodaySelected suppressed={false} /></QueryClientProvider>)
    try {
      expect(screen.getByRole('button', { name: 'summary.loading' })).toBeDisabled()
      await act(async () => { await vi.advanceTimersByTimeAsync(failure === 'quota' ? 1 : 1001) })
      if (failure === 'transient') {
        expect(screen.getByRole('button', { name: 'Your day is ready.' })).toBeEnabled()
        expect(mocks.fetchSummary).toHaveBeenCalledTimes(2)
        return
      }
      expect(screen.getByRole('button', { name: 'summary.error' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'summary.error' })).toHaveAccessibleDescription('summary.retry')
      expect(view.container.querySelector('[data-summary-skeleton]')).toBeNull()
      await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(mocks.fetchSummary).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'summary.error' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(mocks.fetchSummary).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: 'summary.error' })).toBeEnabled()
    } finally { view.unmount(); client.clear() }
  })

})
