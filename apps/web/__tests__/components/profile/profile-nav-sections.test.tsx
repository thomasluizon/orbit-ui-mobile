import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    navTourMap: {} as Record<string, string>,
    onNavClick: vi.fn(),
  }
}

describe('ProfileNavSections', () => {
  it('renders the account section label', () => {
    render(<ProfileNavSections {...baseProps()} />)
    expect(screen.getByText('profile.sections.account')).toBeInTheDocument()
  })

  it('renders a nav row per item and fires onNavClick with the item', () => {
    const props = baseProps()
    render(<ProfileNavSections {...props} />)
    fireEvent.click(screen.getByText('profile.sections.preferences'))
    expect(props.onNavClick).toHaveBeenCalledWith(props.accountNavItems[0])
  })

  it('shows the static hint for account rows', () => {
    render(<ProfileNavSections {...baseProps()} />)
    expect(screen.getByText('profile.sections.preferencesHint')).toBeInTheDocument()
  })
})
