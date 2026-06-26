import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useSummaryMock = vi.fn()
const useProfileMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/hooks/use-summary', () => ({
  useSummary: () => useSummaryMock(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => useProfileMock(),
}))

import { TodayAISummary } from '@/components/habits/today-ai-summary'

function mockProEnabled() {
  useProfileMock.mockReturnValue({
    profile: { hasProAccess: true, aiSummaryEnabled: true, language: 'en' },
  })
}

describe('TodayAISummary insight chip (web)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the insight pill when pro, enabled, and an insight is present', () => {
    mockProEnabled()
    useSummaryMock.mockReturnValue({
      summary: 'You completed 3 of 4 habits today.',
      insight: 'A short walk could lift the afternoon.',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<TodayAISummary date="2026-04-07" />)

    expect(
      screen.getByText('A short walk could lift the afternoon.'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(
        'summary.insightLabel: A short walk could lift the afternoon.',
      ),
    ).toBeInTheDocument()
  })

  it('does not render the insight pill when there is no insight', () => {
    mockProEnabled()
    useSummaryMock.mockReturnValue({
      summary: 'You completed 3 of 4 habits today.',
      insight: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<TodayAISummary date="2026-04-07" />)

    expect(
      screen.getByText('You completed 3 of 4 habits today.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/^summary\.insightLabel:/)).toBeNull()
  })

  it('does not render the insight pill for free users even when an insight is present', () => {
    useProfileMock.mockReturnValue({
      profile: { hasProAccess: false, aiSummaryEnabled: false, language: 'en' },
    })
    useSummaryMock.mockReturnValue({
      summary: null,
      insight: 'should not show',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<TodayAISummary date="2026-04-07" />)

    expect(screen.queryByText('should not show')).toBeNull()
    expect(screen.queryByLabelText(/^summary\.insightLabel:/)).toBeNull()
  })
})
