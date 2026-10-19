import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-proactive-item', () => ({ useProactiveItem: () => ({ item: mocks.item, openItem: mocks.openItem }) }))
vi.mock('@/hooks/use-summary', () => ({ useSummary: (options: unknown) => {
  mocks.query(options)
  return { summary: mocks.summary, isLoading: mocks.isLoading, isFetching: mocks.isFetching, error: mocks.error, refetch: mocks.refetch }
} }))
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
})
