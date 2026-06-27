import { describe, expect, it } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { PlanComparisonCards } from '@/components/upgrade/plan-comparison-cards'
import type { UpgradeTextFn } from '@/components/upgrade/types'

const TestRenderer = require('react-test-renderer')

const t: UpgradeTextFn = (key) => key
const tokens = createTokensV2('purple', 'dark')

function texts(tree: any): unknown[] {
  return tree.root.findAllByType('Text').map((node: any) => node.props.children)
}

describe('PlanComparisonCards (mobile)', () => {
  it('keeps the matrix collapsed until the accordion is opened', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PlanComparisonCards t={t} tokens={tokens} />)
    })
    const collapsed = texts(tree)
    expect(collapsed).toContain('upgrade.matrix.title')
    expect(collapsed).not.toContain('upgrade.features.retrospective.label')
  })

  it('reveals the yearly-only retrospective pill when expanded', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PlanComparisonCards t={t} tokens={tokens} />)
    })
    const toggle = tree.root.findByType('Pressable')
    TestRenderer.act(() => {
      toggle.props.onPress()
    })

    const expanded = texts(tree)
    expect(expanded).toContain('upgrade.features.retrospective.label')
    expect(expanded).toContain('upgrade.matrix.yearlyTag')
    expect(expanded).toContain('upgrade.matrix.notIncluded')
  })
})
