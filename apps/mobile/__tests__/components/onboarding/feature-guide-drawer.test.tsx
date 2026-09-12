import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/ui/chip', () => ({
  Chip: ({
    children,
    onPress,
  }: {
    children: React.ReactNode
    onPress: () => void
  }) => React.createElement('ChipStub', { onPress }, children),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    currentScheme: 'purple',
    currentTheme: 'dark',
  }),
}))

const TestRenderer = require('react-test-renderer')

type RenderedNode = {
  props: Record<string, unknown>
}

type RenderedTree = {
  root: {
    findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
  }
  toJSON: () => unknown
}

function pressTab(tree: RenderedTree, label: string) {
  const tab = tree.root.findAll(
    (node) => node.props.children === label && typeof node.props.onPress === 'function',
  )[0]
  if (!tab) throw new Error(`Missing tab: ${label}`)
  TestRenderer.act(() => {
    ;(tab.props.onPress as () => void)()
  })
}

describe('FeatureGuideDrawer (mobile)', () => {
  it('renders Progresso instead of a standalone goals destination', () => {
    let tree: RenderedTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<FeatureGuideDrawer open onClose={vi.fn()} />)
    })

    expect(JSON.stringify(tree!.toJSON())).toContain('onboarding.featureGuide.progress')
    expect(JSON.stringify(tree!.toJSON())).not.toContain('onboarding.featureGuide.goals')

    pressTab(tree!, 'onboarding.featureGuide.progress')
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'onboarding.featureGuide.progressSection.goalsTitle',
    )
    expect(JSON.stringify(tree!.toJSON())).not.toContain(
      'onboarding.featureGuide.progressSection.metricsTitle',
    )
  })

  it('omits entries for retired surfaces', () => {
    let tree: RenderedTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<FeatureGuideDrawer open onClose={vi.fn()} />)
    })

    pressTab(tree!, 'onboarding.featureGuide.calendar')
    expect(JSON.stringify(tree!.toJSON())).not.toContain(
      `onboarding.featureGuide.calendarSection.${['colors', 'Title'].join('')}`,
    )

    pressTab(tree!, 'onboarding.featureGuide.rewards')
    for (const prefix of ['insights', 'retrospective']) {
      expect(JSON.stringify(tree!.toJSON())).not.toContain(
        `onboarding.featureGuide.rewardsSection.${prefix}Title`,
      )
    }
  })
})
