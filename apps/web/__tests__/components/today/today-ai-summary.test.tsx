import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { TodayAISummary } from '@/components/today/today-ai-summary'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'

const mocks = vi.hoisted(() => ({
  profile: undefined as ReturnType<typeof createMockProfile> | undefined,
  summary: 'A short daily summary.' as string | null,
  isLoading: false,
  isFetching: false,
  error: null as Error | null,
  refetch: vi.fn(),
  useSummary: vi.fn(),
}))


vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'pt-BR' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-summary', () => ({ useSummary: (options: unknown) => {
  mocks.useSummary(options)
  return mocks
} }))

beforeEach(() => {
  mocks.profile = createMockProfile({ hasProAccess: true, aiSummaryEnabled: true, language: 'en', timeZone: 'America/Sao_Paulo' })
  mocks.summary = 'A short daily summary.'
  mocks.isLoading = false
  mocks.isFetching = false
  mocks.error = null
  mocks.refetch.mockReset()
  mocks.useSummary.mockClear()
  useChatStore.setState({ messages: [], proactiveEntryId: null })
  useUIStore.setState({ astraConversationOpen: false })
})

describe('daily summary on Hoje', () => {
  it('fetches the selected account day and opens the full-screen Astra conversation', () => {
    render(<TodayAISummary date="2026-08-29" />)
    expect(screen.getByText('A short daily summary.')).toBeInTheDocument()
    expect(screen.queryByText('aiDisclosure.notMedicalAdvice')).not.toBeInTheDocument()
    expect(mocks.useSummary).toHaveBeenCalledWith({ date: '2026-08-29', locale: 'en', timeZone: 'America/Sao_Paulo', hasProAccess: true, aiSummaryEnabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'A short daily summary.' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('opens the complete long summary through its first sentence without an expand control', () => {
    mocks.summary = 'Your habits are ready for today. '.repeat(8)
    render(<TodayAISummary date="2026-08-29" />)
    expect(screen.queryByRole('button', { name: 'common.seeMore' })).not.toBeInTheDocument()
    const slot = screen.getByRole('button', { name: 'Your habits are ready for today.' })
    expect(slot).toHaveAccessibleDescription('todayAstra.openConversation')
    fireEvent.click(slot)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(useChatStore.getState().messages[0]).toMatchObject({ role: 'ai', content: mocks.summary })
  })

  it('shows loading and prevents conversation activation while pending', () => {
    mocks.summary = null
    mocks.isLoading = true
    mocks.isFetching = true
    const { container } = render(<TodayAISummary date="2026-08-29" />)
    expect(container.querySelector('[data-summary-skeleton]')).toBeInTheDocument()
    expect(container.querySelector('[data-today-astra-slot]')).toHaveAttribute('aria-busy', 'true')
    const action = screen.getByRole('button', { name: 'summary.loading' })
    expect(action).toBeDisabled()
    fireEvent.click(action)
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('retries an error and prevents repeated retries during a pending request', () => {
    mocks.error = new Error('Unavailable')
    const page = render(<TodayAISummary date="2026-08-29" />)
    expect(screen.getByText('summary.error')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'summary.askAstra' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'summary.error' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    mocks.isFetching = true
    page.rerender(<TodayAISummary date="2026-08-29" />)
    fireEvent.click(screen.getByRole('button', { name: 'summary.error' }))
    expect(screen.getByRole('button', { name: 'summary.error' })).toBeDisabled()
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it('routes free accounts to Pro without requesting a summary', () => {
    mocks.profile = createMockProfile({ hasProAccess: false })
    render(<TodayAISummary date="2026-08-29" />)
    expect(screen.getByRole('link', { name: 'summary.freePrompt' })).toHaveAttribute('href', '/upgrade')
    expect(mocks.useSummary).not.toHaveBeenCalled()
  })

  it.each(['disabled', 'profile pending'])('withholds the summary when %s', (state) => {
    mocks.profile = state === 'disabled' ? createMockProfile({ hasProAccess: true, aiSummaryEnabled: false }) : undefined
    const { container } = render(<TodayAISummary date="2026-08-29" />)
    expect(container).toBeEmptyDOMElement()
    expect(mocks.useSummary).not.toHaveBeenCalled()
  })

  it('uses the UI language when the profile has no preference', () => {
    mocks.profile = createMockProfile({ hasProAccess: true, aiSummaryEnabled: true, language: null })
    render(<TodayAISummary date="2026-08-29" />)
    expect(mocks.useSummary).toHaveBeenCalledWith(expect.objectContaining({ locale: 'pt-BR' }))
  })
})
