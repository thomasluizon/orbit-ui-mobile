import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => null,
}))

import { createTokensV2 } from '@/lib/theme'
import { AiFeatureToggles } from '@/app/ai-settings-sections'

const TestRenderer = require('react-test-renderer')

const tokens = createTokensV2('purple', 'dark')
const translate = (key: string) => key

interface TestNode {
  type: unknown
  props: Record<string, unknown>
}

type TestTree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] }
}

const PROACTIVE_LABEL = 'profile.proactiveAstra.title'

function baseProps() {
  return {
    tokens,
    t: translate,
    hasProAccess: true,
    aiMemoryEnabled: true,
    aiSummaryEnabled: true,
    proactiveAstraEnabled: false,
    memoryPending: false,
    summaryPending: false,
    proactivePending: false,
    onToggleMemory: vi.fn(),
    onToggleSummary: vi.fn(),
    onToggleProactive: vi.fn(),
    onUpgrade: vi.fn(),
  }
}

function renderToggles(props: ReturnType<typeof baseProps>): TestTree {
  let tree: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(<AiFeatureToggles {...props} />)
  })
  return tree!
}

function switches(tree: TestTree): TestNode[] {
  return tree.root.findAll(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'switch',
  )
}

function findNode(
  tree: TestTree,
  role: string,
  label: string,
): TestNode | undefined {
  return tree.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === role &&
      node.props.accessibilityLabel === label,
  )[0]
}

describe('mobile AiFeatureToggles', () => {
  it('renders a proactive-check-ins switch reflecting its off state for Pro users', () => {
    const tree = renderToggles(baseProps())
    expect(switches(tree)).toHaveLength(3)

    const proactive = findNode(tree, 'switch', PROACTIVE_LABEL)
    expect(proactive).toBeDefined()
    expect(
      (proactive?.props.accessibilityState as { checked?: boolean }).checked,
    ).toBe(false)
  })

  it('calls onToggleProactive when the proactive switch is pressed', () => {
    const props = baseProps()
    const tree = renderToggles(props)

    const proactive = findNode(tree, 'switch', PROACTIVE_LABEL)
    TestRenderer.act(() => {
      ;(proactive?.props.onPress as () => void)()
    })
    expect(props.onToggleProactive).toHaveBeenCalledTimes(1)
  })

  it('locks the proactive row behind an upgrade prompt for non-pro users', () => {
    const props = { ...baseProps(), hasProAccess: false }
    const tree = renderToggles(props)
    expect(switches(tree)).toHaveLength(0)

    const lockedRow = findNode(tree, 'button', PROACTIVE_LABEL)
    expect(lockedRow).toBeDefined()
    TestRenderer.act(() => {
      ;(lockedRow?.props.onPress as () => void)()
    })
    expect(props.onUpgrade).toHaveBeenCalledTimes(1)
  })
})
