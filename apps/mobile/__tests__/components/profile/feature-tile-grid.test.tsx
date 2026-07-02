import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { ProfileNavItem } from '@orbit/shared/utils/profile-navigation'

interface TestNode {
  type: unknown
  props: {
    accessibilityLabel?: string
    onPress?: (...args: unknown[]) => unknown
    [key: string]: unknown
  }
}

interface TestTreeRoot extends TestNode {
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestInstance {
  root: TestTreeRoot
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    currentScheme: 'purple',
    currentTheme: 'dark',
  }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  tintFromPrimary: () => 'rgba(17, 17, 17, 0.1)',
  radius: { sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, full: 9999 },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: createMockProfile({ hasProAccess: true }) }),
}))

vi.mock('@/components/profile/profile-nav-icon', () => ({
  ProfileNavIcon: () => null,
}))

vi.mock('lucide-react-native', () => ({
  Lock: () => React.createElement('Lock'),
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

function findPressableByLabel(tree: TestInstance, accessibilityLabel: string): TestNode {
  const node = tree.root
    .findAll((candidate) => candidate.props.accessibilityLabel === accessibilityLabel)
    .find((candidate) => typeof candidate.props.onPress === 'function')
  if (!node) throw new Error(`No pressable with label "${accessibilityLabel}"`)
  return node
}

async function renderGrid(overrides: Partial<Parameters<typeof FeatureTileGrid>[0]> = {}) {
  const props = {
    items: [makeNavItem(), retrospectiveItem],
    profile: createMockProfile({ hasProAccess: false }),
    onItemSelect: vi.fn(),
    onTourReplay: vi.fn(),
    ...overrides,
  }
  let tree!: TestInstance
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<FeatureTileGrid {...props} />)
  })
  return { tree, props }
}

describe('FeatureTileGrid', () => {
  it('renders the tour-replay tile plus one tile per feature item', async () => {
    const { tree } = await renderGrid()

    expect(findPressableByLabel(tree, 'tour.replay.title')).toBeTruthy()
    expect(findPressableByLabel(tree, 'profile.wrappedTitle')).toBeTruthy()
  })

  it('fires onItemSelect with the item when a tile is pressed', async () => {
    const { tree, props } = await renderGrid()

    await TestRenderer.act(async () => {
      findPressableByLabel(tree, 'profile.wrappedTitle').props.onPress?.()
    })

    expect(props.onItemSelect).toHaveBeenCalledWith(props.items[0])
  })

  it('fires onTourReplay when the tour-replay tile is pressed', async () => {
    const { tree, props } = await renderGrid()

    await TestRenderer.act(async () => {
      findPressableByLabel(tree, 'tour.replay.title').props.onPress?.()
    })

    expect(props.onTourReplay).toHaveBeenCalledTimes(1)
  })

  it('announces the locked state on gated tiles the user cannot access and still fires onItemSelect', async () => {
    const { tree, props } = await renderGrid()

    const lockedTile = findPressableByLabel(
      tree,
      'profile.retrospectiveTitle, common.locked',
    )
    await TestRenderer.act(async () => {
      lockedTile.props.onPress?.()
    })

    expect(props.onItemSelect).toHaveBeenCalledWith(retrospectiveItem)
  })

  it('drops the locked announcement once the user has access', async () => {
    const { tree } = await renderGrid({
      profile: createMockProfile({
        hasProAccess: true,
        subscriptionInterval: 'yearly',
      }),
    })

    expect(findPressableByLabel(tree, 'profile.retrospectiveTitle')).toBeTruthy()
    expect(
      tree.root.findAll(
        (candidate) =>
          candidate.props.accessibilityLabel === 'profile.retrospectiveTitle, common.locked',
      ),
    ).toHaveLength(0)
  })
})
