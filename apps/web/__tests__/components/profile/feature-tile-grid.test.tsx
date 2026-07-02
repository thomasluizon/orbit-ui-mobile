import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { ProfileNavItem } from '@orbit/shared/utils/profile-navigation'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { FeatureTileGrid } from '@/components/profile/feature-tile-grid'

function makeNavItem(overrides: Partial<ProfileNavItem> = {}): ProfileNavItem {
  return {
    id: 'wrapped',
    section: 'features',
    route: '/wrapped',
    iconKey: 'wrapped',
    titleKey: 'profile.wrappedTitle',
    hintKey: 'profile.wrappedHint',
    variant: 'primary',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
    ...overrides,
  }
}

const retrospectiveItem = makeNavItem({
  id: 'retrospective',
  route: '/retrospective',
  iconKey: 'retrospective',
  titleKey: 'profile.retrospectiveTitle',
  hintKey: 'profile.retrospectiveHint',
  proBadge: true,
  entitlementRequirement: 'yearlyPro',
  entitlementMode: 'redirect',
})

function baseProps() {
  return {
    items: [makeNavItem(), retrospectiveItem],
    profile: createMockProfile({ hasProAccess: false }),
    onItemSelect: vi.fn(),
    onTourReplay: vi.fn(),
  }
}

describe('FeatureTileGrid', () => {
  it('renders the tour-replay tile plus one tile per feature item', () => {
    render(<FeatureTileGrid {...baseProps()} />)

    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(
      screen.getByRole('button', { name: 'tour.replay.title' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'profile.wrappedTitle' }),
    ).toBeInTheDocument()
  })

  it('fires onItemSelect with the item when a tile is clicked', () => {
    const props = baseProps()
    render(<FeatureTileGrid {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'profile.wrappedTitle' }))

    expect(props.onItemSelect).toHaveBeenCalledWith(props.items[0])
  })

  it('fires onTourReplay when the tour-replay tile is clicked', () => {
    const props = baseProps()
    render(<FeatureTileGrid {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'tour.replay.title' }))

    expect(props.onTourReplay).toHaveBeenCalledTimes(1)
  })

  it('announces the locked state on gated tiles the user cannot access and still fires onItemSelect', () => {
    const props = baseProps()
    render(<FeatureTileGrid {...props} />)

    const lockedTile = screen.getByRole('button', {
      name: 'profile.retrospectiveTitle, common.locked',
    })
    fireEvent.click(lockedTile)

    expect(props.onItemSelect).toHaveBeenCalledWith(retrospectiveItem)
  })

  it('shows the PRO pill instead of the locked state once the user has access', () => {
    const props = {
      ...baseProps(),
      profile: createMockProfile({
        hasProAccess: true,
        subscriptionInterval: 'yearly',
      }),
    }
    render(<FeatureTileGrid {...props} />)

    expect(
      screen.queryByRole('button', {
        name: 'profile.retrospectiveTitle, common.locked',
      }),
    ).not.toBeInTheDocument()
    const tile = screen.getByRole('button', { name: 'profile.retrospectiveTitle' })
    expect(within(tile).getByText('common.proBadge')).toBeInTheDocument()
  })

  it('carries the mapped data-tour attribute on the matching tile', () => {
    render(
      <FeatureTileGrid
        {...baseProps()}
        dataTourMap={{ retrospective: 'tour-profile-retrospective' }}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'profile.retrospectiveTitle, common.locked',
      }),
    ).toHaveAttribute('data-tour', 'tour-profile-retrospective')
  })
})
