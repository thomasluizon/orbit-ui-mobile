import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockGamificationProfile } from '@orbit/shared/__tests__/factories'
import type { ProfileNavItem } from '@orbit/shared/utils/profile-navigation'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

import { ProfileNavSections } from '@/app/(app)/profile/_components/profile-nav-sections'

function makeNavItem(overrides: Partial<ProfileNavItem> = {}): ProfileNavItem {
  return {
    id: 'preferences',
    section: 'account',
    route: '/preferences',
    iconKey: 'settings',
    titleKey: 'profile.sections.preferences',
    hintKey: 'profile.sections.preferencesHint',
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
    ...overrides,
  }
}

function baseProps() {
  return {
    accountNavItems: [makeNavItem()],
    featureNavItems: [
      makeNavItem({
        id: 'achievements',
        section: 'features',
        route: '/achievements',
        iconKey: 'achievements',
        titleKey: 'gamification.profileCard.title',
        hintKey: 'gamification.profileCard.hint',
        proBadge: true,
        hintMode: 'gamificationProfile',
      }),
    ],
    navTourMap: {} as Record<string, string>,
    hasProAccess: false,
    gamificationProfile: null,
    onNavClick: vi.fn(),
    onTourReplay: vi.fn(),
  }
}

describe('ProfileNavSections', () => {
  it('renders account and feature section labels', () => {
    render(<ProfileNavSections {...baseProps()} />)
    expect(screen.getByText('profile.sections.account')).toBeInTheDocument()
    expect(screen.getByText('profile.sections.features')).toBeInTheDocument()
  })

  it('renders a nav row per item and fires onNavClick with the item', () => {
    const props = baseProps()
    render(<ProfileNavSections {...props} />)
    fireEvent.click(screen.getByText('profile.sections.preferences'))
    expect(props.onNavClick).toHaveBeenCalledWith(props.accountNavItems[0])
  })

  it('fires onNavClick for feature rows with the feature item', () => {
    const props = baseProps()
    render(<ProfileNavSections {...props} />)
    fireEvent.click(screen.getByText('gamification.profileCard.title'))
    expect(props.onNavClick).toHaveBeenCalledWith(props.featureNavItems[0])
  })

  it('renders the tour-replay row and fires onTourReplay', () => {
    const props = baseProps()
    render(<ProfileNavSections {...props} />)
    fireEvent.click(screen.getByText('tour.replay.title'))
    expect(props.onTourReplay).toHaveBeenCalled()
  })

  it('shows the static hint for gamification rows without pro access', () => {
    render(<ProfileNavSections {...baseProps()} />)
    expect(screen.getByText('gamification.profileCard.hint')).toBeInTheDocument()
  })

  it('shows the level and XP hint for gamification rows with pro access and a profile', () => {
    const props = {
      ...baseProps(),
      hasProAccess: true,
      gamificationProfile: createMockGamificationProfile({ level: 3, totalXp: 500 }),
    }
    render(<ProfileNavSections {...props} />)
    expect(
      screen.getByText(
        'gamification.profileCard.level:{"level":3} · gamification.profileCard.totalXp:{"total":500}',
      ),
    ).toBeInTheDocument()
  })
})
