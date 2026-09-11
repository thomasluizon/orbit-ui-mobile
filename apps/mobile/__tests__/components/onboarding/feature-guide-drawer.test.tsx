import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'

const TestRenderer = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) =>
    React.createElement('Sheet', null, children),
}))
vi.mock('@/components/ui/chip', () => ({
  Chip: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
    React.createElement('Chip', { onPress }, children)
  ),
}))

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return flattenText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

describe('FeatureGuideDrawer', () => {
  it('renders Progresso instead of a standalone goals destination', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<FeatureGuideDrawer open onClose={vi.fn()} />)
    })

    const chips = tree!.root.findAllByType('Chip')
    const labels = chips.map((chip: { props: { children?: unknown } }) => flattenText(chip.props.children))

    expect(labels).toContain('onboarding.featureGuide.progress')
    expect(labels).not.toContain('onboarding.featureGuide.goals')

    const progressChip = chips.find(
      (chip: { props: { children?: unknown } }) =>
        flattenText(chip.props.children) === 'onboarding.featureGuide.progress',
    )
    await TestRenderer.act(() => progressChip.props.onPress())

    const rendered = tree!.root
      .findAllByType('Text')
      .map((node: { props: { children?: unknown } }) => flattenText(node.props.children))
    expect(rendered).toContain('onboarding.featureGuide.progressSection.goalsTitle')
    expect(rendered).not.toContain('onboarding.featureGuide.progressSection.metricsTitle')
  })
})
