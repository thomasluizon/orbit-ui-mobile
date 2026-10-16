import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { TodayAISummary } from '@/components/today/today-ai-summary'
import { useUIStore } from '@/stores/ui-store'

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
  mocks.profile = createMockProfile({ hasProAccess: true, aiSummaryEnabled: true, language: 'en' })
  mocks.summary = 'A short daily summary.'
  mocks.isLoading = false
  mocks.isFetching = false
  mocks.error = null
  mocks.refetch.mockReset()
  mocks.useSummary.mockClear()
  useUIStore.setState({ astraConversationOpen: false })
})

describe('daily summary on Hoje', () => {
  it('fetches the selected account day and opens the full-screen Astra conversation', () => {
    render(<TodayAISummary date="2026-08-29" />)
    expect(screen.getByText('A short daily summary.')).toBeInTheDocument()
    expect(screen.getByText('aiDisclosure.notMedicalAdvice')).toBeInTheDocument()
    expect(mocks.useSummary).toHaveBeenCalledWith({ date: '2026-08-29', locale: 'en', hasProAccess: true, aiSummaryEnabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'summary.askAstra' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('expands and collapses long summaries without opening Astra', () => {
    mocks.summary = 'Your habits are ready for today. '.repeat(8)
    render(<TodayAISummary date="2026-08-29" />)
    const expand = screen.getByRole('button', { name: 'common.seeMore' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(expand.getAttribute('aria-controls')!)).toHaveTextContent(mocks.summary.trim())
    expect(screen.queryByText('aiDisclosure.notMedicalAdvice')).not.toBeInTheDocument()
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: 'common.seeLess' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('aiDisclosure.notMedicalAdvice')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.seeLess' }))
    expect(screen.getByRole('button', { name: 'common.seeMore' })).toHaveAttribute('aria-expanded', 'false')
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('shows loading and prevents conversation activation while pending', () => {
    mocks.summary = null
    mocks.isLoading = true
    mocks.isFetching = true
    render(<TodayAISummary date="2026-08-29" />)
    expect(screen.getByText('summary.loading')).toBeInTheDocument()
    const action = screen.getByRole('button', { name: 'summary.askAstra' })
    expect(action).toBeDisabled()
    fireEvent.click(action)
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('retries an error and prevents repeated retries during a pending request', () => {
    mocks.error = new Error('Unavailable')
    const page = render(<TodayAISummary date="2026-08-29" />)
    expect(screen.getByText('summary.error')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'summary.askAstra' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'summary.retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    mocks.isFetching = true
    page.rerender(<TodayAISummary date="2026-08-29" />)
    fireEvent.click(screen.getByRole('button', { name: 'summary.retry' }))
    expect(screen.getByRole('button', { name: 'summary.retry' })).toBeDisabled()
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it('routes free accounts to Pro without requesting a summary', () => {
    mocks.profile = createMockProfile({ hasProAccess: false })
    render(<TodayAISummary date="2026-08-29" />)
    expect(screen.getByRole('link', { name: 'summary.upgrade' })).toHaveAttribute('href', '/upgrade')
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
