import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const useSummaryMock = vi.fn()
const useProfileMock = vi.fn()
const pushMock = vi.fn()
const isDesktopMock = vi.fn()
const setAstraOpen = vi.fn()
const setAstraMaximized = vi.fn()

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

vi.mock('@/hooks/use-is-desktop', () => ({
  useIsDesktop: () => isDesktopMock(),
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ setAstraOpen, setAstraMaximized }),
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

  it('opens and maximizes the docked Astra copilot on desktop without navigating', () => {
    isDesktopMock.mockReturnValue(true)
    mockSummaryReady()

    render(<TodayAISummary date="2026-04-07" />)
    fireEvent.click(screen.getByRole('button', { name: 'summary.askAstra' }))

    expect(setAstraOpen).toHaveBeenCalledWith(true)
    expect(setAstraMaximized).toHaveBeenCalledWith(true)
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('navigates to /chat at mobile width without touching the shell store', () => {
    isDesktopMock.mockReturnValue(false)
    mockSummaryReady()

    render(<TodayAISummary date="2026-04-07" />)
    fireEvent.click(screen.getByRole('button', { name: 'summary.askAstra' }))

    expect(pushMock).toHaveBeenCalledWith('/chat')
    expect(setAstraOpen).not.toHaveBeenCalled()
    expect(setAstraMaximized).not.toHaveBeenCalled()
  })
})
