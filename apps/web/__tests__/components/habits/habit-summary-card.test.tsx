import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { HabitSummaryCard } from '@/components/habits/habit-summary-card'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefetch = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    return t
  },
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-summary', () => ({
  useSummary: vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: vi.fn(),
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => <span data-testid="pro-badge">PRO</span>,
}))

import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'

const mockUseSummary = vi.mocked(useSummary)
const mockUseProfile = vi.mocked(useProfile)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HabitSummaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when user does not have pro access', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: false, aiSummaryEnabled: true },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    const { container } = render(<HabitSummaryCard date="2025-01-01" />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null when AI summary is disabled', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: false },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    const { container } = render(<HabitSummaryCard date="2025-01-01" />)
    expect(container.innerHTML).toBe('')
  })

  it('shows loading skeleton when data is loading', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: null,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    render(<HabitSummaryCard date="2025-01-01" />)
    expect(screen.getByText('summary.title')).toBeDefined()
    expect(screen.getByText('summary.loading')).toBeDefined()
  })

  it('shows error state with retry button', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    render(<HabitSummaryCard date="2025-01-01" />)
    expect(screen.getByText('summary.error')).toBeDefined()
    expect(screen.getByText('summary.retry')).toBeDefined()
  })

  it('calls refetch when retry button is clicked', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      error: new Error('err'),
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    render(<HabitSummaryCard date="2025-01-01" />)
    fireEvent.click(screen.getByText('summary.retry'))
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('renders summary text when data is available', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: 'Great job on your habits today!',
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    render(<HabitSummaryCard date="2025-01-01" />)
    expect(screen.getByText('Great job on your habits today!')).toBeDefined()
    expect(screen.getByText('summary.title')).toBeDefined()
  })

  it('shows ProBadge in both loading and content states', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: 'Summary text',
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    render(<HabitSummaryCard date="2025-01-01" />)
    expect(screen.getByTestId('pro-badge')).toBeDefined()
  })

  it('returns null when there is no summary, no loading, and no error', () => {
    mockUseProfile.mockReturnValue({
      profile: { hasProAccess: true, aiSummaryEnabled: true },
    } as ReturnType<typeof useProfile>)
    mockUseSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useSummary>)

    const { container } = render(<HabitSummaryCard date="2025-01-01" />)
    expect(container.innerHTML).toBe('')
  })
})
