import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

function mockSummaryReady() {
  useProfileMock.mockReturnValue({
    profile: { hasProAccess: true, aiSummaryEnabled: true, language: 'en' },
  })
  useSummaryMock.mockReturnValue({
    summary: 'You completed 3 of 4 habits today.',
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })
}

describe('TodayAISummary click target', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the retained chat route after the docked Astra rail is deleted', () => {
    mockSummaryReady()

    render(<TodayAISummary date="2026-04-07" />)
    fireEvent.click(screen.getByRole('button', { name: 'summary.askAstra' }))

    expect(pushMock).toHaveBeenCalledWith('/chat')
  })
})
