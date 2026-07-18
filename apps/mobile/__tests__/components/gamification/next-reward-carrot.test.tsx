import { describe, expect, it, vi } from 'vitest'

import { NextRewardCarrot } from '@/app/(tabs)/profile/_components/next-reward-carrot'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}:${JSON.stringify(params)}`
      return key
    },
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => ({
      primary: '#7c5cff',
      primaryPressed: '#6a4ce0',
      fgOnPrimary: '#ffffff',
      fg1: '#ffffff',
      fg2: '#cccccc',
      fg3: '#999999',
    }),
    tintFromPrimary: () => 'rgba(124, 92, 255, 0.08)',
  }
})

vi.mock('@/components/ui/icons', () => ({
  Gift: () => null,
  Lock: () => null,
}))

function render(props: Parameters<typeof NextRewardCarrot>[0]) {
  let tree: { toJSON: () => unknown; root: { findAll: (predicate: (node: { props?: Record<string, unknown> }) => boolean) => unknown[] } }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<NextRewardCarrot {...props} />)
  })
  return tree!
}

function collectText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  if (typeof node === 'object' && 'children' in (node as Record<string, unknown>)) {
    return collectText((node as { children: unknown }).children)
  }
  return ''
}

function serialize(tree: { toJSON: () => unknown }) {
  return collectText(tree.toJSON())
}

function findUpgradeButton(tree: { root: { findAll: (predicate: (node: { props?: Record<string, unknown> }) => boolean) => unknown[] } }) {
  return tree.root.findAll(
    (node) =>
      !!node.props &&
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  )
}

const baseCarrot = { nextLevel: 4, nextLevelTitle: 'Navigator', xpToNextLevel: 300 }

describe('NextRewardCarrot (mobile)', () => {
  it('renders nothing when carrot is null', () => {
    const tree = render({ carrot: null, onUpgrade: vi.fn() })
    expect(tree.toJSON()).toBeNull()
  })

  it('shows the next level, XP-to-go, Pro teaser, and upgrade CTA', () => {
    const onUpgrade = vi.fn()
    const tree = render({ carrot: { ...baseCarrot, showProTeaser: true }, onUpgrade })

    const serialized = serialize(tree)
    expect(serialized).toContain('gamification.carrot.title'.toUpperCase())
    expect(serialized).toContain('gamification.carrot.toNextLevel:{"xp":300,"level":4}')
    expect(serialized).toContain('gamification.carrot.proTeaser.title')
    expect(serialized).toContain('gamification.carrot.proTeaser.achievements')

    const [button] = findUpgradeButton(tree) as Array<{ props: { onPress: () => void } }>
    expect(button).toBeTruthy()
    TestRenderer.act(() => button!.props.onPress())
    expect(onUpgrade).toHaveBeenCalledTimes(1)
  })

  it('omits the Pro teaser and CTA when showProTeaser is false', () => {
    const tree = render({ carrot: { ...baseCarrot, showProTeaser: false }, onUpgrade: vi.fn() })

    const serialized = serialize(tree)
    expect(serialized).toContain('gamification.carrot.toNextLevel:{"xp":300,"level":4}')
    expect(serialized).not.toContain('gamification.carrot.proTeaser.title')
    expect(findUpgradeButton(tree)).toHaveLength(0)
  })
})
