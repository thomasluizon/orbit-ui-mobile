import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProfileHeaderBar } from '@/app/(app)/profile/_components/profile-header-bar'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { canViewGamification: true } }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakInfo: () => ({ data: { isFrozenToday: false } }) }))
vi.mock('@/components/ui/theme-toggle', () => ({ ThemeToggle: () => <button>Theme</button> }))
vi.mock('@/components/gamification/streak-badge', () => ({ StreakBadge: ({ streak }: { streak: number }) => <button>Streak {streak}</button> }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => <button>Notifications</button> }))

describe('ProfileHeaderBar', () => {
  it.each([0, 99, 9999])('keeps all controls outside the centred title row at streak %i', (streak) => {
    render(<ProfileHeaderBar streak={streak} error={null} />)
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { name: 'nav.profile' })).toBeInTheDocument()
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    const actions = screen.getByTestId('profile-header-actions')
    expect(header.nextElementSibling).toBe(actions)
    expect(within(actions).getAllByRole('button')).toHaveLength(3)
    expect(within(actions).getByRole('button', { name: `Streak ${streak}` })).toBeInTheDocument()
    expect(actions.querySelector('[data-tour="tour-streak-badge"]')).toBeInTheDocument()
  })
})
