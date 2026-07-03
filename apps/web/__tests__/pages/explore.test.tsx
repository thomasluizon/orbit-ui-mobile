import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}))

let mockProfile: Record<string, unknown> | null = null
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

let mockGamificationProfile: { level: number; totalXp: number } | null = null
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ profile: mockGamificationProfile }),
}))

vi.mock('@/components/tour/tour-replay-modal', () => ({
  TourReplayModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="tour-replay-modal" /> : null,
}))

import ExplorePage from '@/app/(app)/explore/page'

describe('ExplorePage', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockProfile = {
      hasProAccess: true,
      isLifetimePro: false,
      subscriptionInterval: 'yearly',
      canViewGamification: true,
    }
    mockGamificationProfile = null
  })

  it('renders the grouped sections with every feature row except Social', () => {
    render(<ExplorePage />)

    expect(screen.getByText('explore.sections.discover')).toBeInTheDocument()
    expect(screen.getByText('explore.sections.progress')).toBeInTheDocument()
    expect(screen.getByText('explore.sections.integrations')).toBeInTheDocument()
    expect(screen.getByText('explore.sections.more')).toBeInTheDocument()

    expect(screen.getByText('tour.replay.title')).toBeInTheDocument()
    expect(screen.getByText('profile.retrospectiveTitle')).toBeInTheDocument()
    expect(screen.getByText('profile.wrappedTitle')).toBeInTheDocument()
    expect(screen.getByText('gamification.profileCard.title')).toBeInTheDocument()
    expect(screen.getByText('calendar.profileButton')).toBeInTheDocument()
    expect(screen.getByText('profile.sections.aboutHelp')).toBeInTheDocument()
    expect(screen.getByText('profile.sections.advanced')).toBeInTheDocument()

    expect(screen.queryByText('social.profileNav.title')).not.toBeInTheDocument()
  })

  it('describes every row with its hint line', () => {
    render(<ExplorePage />)

    expect(screen.getByText('explore.tourHint')).toBeInTheDocument()
    expect(screen.getByText('profile.retrospectiveHint')).toBeInTheDocument()
    expect(screen.getByText('calendar.profileHint')).toBeInTheDocument()
  })

  it('shows the personalized level hint on achievements when gamification is loaded', () => {
    mockGamificationProfile = { level: 4, totalXp: 1200 }
    render(<ExplorePage />)

    expect(
      screen.getByText((content) => content.startsWith('gamification.profileCard.level:')),
    ).toBeInTheDocument()
  })

  it('marks the gated features with the PRO badge', () => {
    render(<ExplorePage />)

    expect(screen.getAllByText('common.proBadge')).toHaveLength(3)
  })

  it('navigates to the feature route on row click', () => {
    render(<ExplorePage />)

    fireEvent.click(screen.getByText('profile.sections.aboutHelp'))
    expect(mockPush).toHaveBeenCalledWith('/about')
  })

  it('redirects a non-entitled user to upgrade for gated features', () => {
    mockProfile = { hasProAccess: false, isLifetimePro: false, subscriptionInterval: null }
    render(<ExplorePage />)

    fireEvent.click(screen.getByText('profile.retrospectiveTitle'))
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
  })

  it('opens the tour replay modal from the discover row', () => {
    render(<ExplorePage />)

    expect(screen.queryByTestId('tour-replay-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('tour.replay.title'))
    expect(screen.getByTestId('tour-replay-modal')).toBeInTheDocument()
  })
})
