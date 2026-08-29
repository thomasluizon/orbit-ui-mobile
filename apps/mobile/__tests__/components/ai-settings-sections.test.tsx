import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { AiFeatureToggles } from '@/components/profile/ai-settings-sections'

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => null,
}))

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

const SUMMARY_LABEL = 'profile.aiSummary.title'
const PROACTIVE_LABEL = 'profile.proactiveAstra.title'

function baseProps() {
  return {
    tokens,
    t: translate,
    hasProAccess: true,
    aiSummaryEnabled: true,
    proactiveAstraEnabled: false,
    summaryPending: false,
    proactivePending: false,
    onToggleSummary: vi.fn(),
    onToggleProactive: vi.fn(),
    onUpgrade: vi.fn(),
  }
}

function renderToggles(props = baseProps()): TestTree {
  let tree: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(<AiFeatureToggles {...props} />)
  })
  return tree!
}

function nodesWithRole(tree: TestTree, role: string): TestNode[] {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityRole === role,
  )
}

function findNode(tree: TestTree, role: string, label: string): TestNode | undefined {
  return nodesWithRole(tree, role).find(
    (node) => node.props.accessibilityLabel === label,
  )
}

function press(node: TestNode | undefined) {
  TestRenderer.act(() => {
    ;(node?.props.onPress as (() => void) | undefined)?.()
  })
}

describe('mobile AiFeatureToggles', () => {
  it('renders exactly the daily summary and proactive switches for Pro users', () => {
    const tree = renderToggles()
    const switches = nodesWithRole(tree, 'switch')
    expect(switches).toHaveLength(2)
    expect(findNode(tree, 'switch', SUMMARY_LABEL)).toBeDefined()
    const proactive = findNode(tree, 'switch', PROACTIVE_LABEL)
    expect(proactive).toBeDefined()
    expect(
      (proactive?.props.accessibilityState as { checked?: boolean }).checked,
    ).toBe(false)
  })

  it('calls both surviving callbacks from their switches', () => {
    const props = baseProps()
    const tree = renderToggles(props)
    press(findNode(tree, 'switch', SUMMARY_LABEL))
    press(findNode(tree, 'switch', PROACTIVE_LABEL))
    expect(props.onToggleSummary).toHaveBeenCalledTimes(1)
    expect(props.onToggleProactive).toHaveBeenCalledTimes(1)
  })

  it('hides pending switch descendants behind one disabled accessibility node', () => {
    const props = { ...baseProps(), summaryPending: true }
    const tree = renderToggles(props)
    const summary = findNode(tree, 'switch', SUMMARY_LABEL)
    expect(summary?.props.accessibilityState).toEqual({ checked: true, disabled: true })
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string'
          && node.props.importantForAccessibility === 'no-hide-descendants',
      ),
    ).toHaveLength(1)
  })

  it('renders exactly two locked upgrade rows for free users', () => {
    const props = { ...baseProps(), hasProAccess: false }
    const tree = renderToggles(props)
    expect(nodesWithRole(tree, 'switch')).toHaveLength(0)
    const rows = nodesWithRole(tree, 'button')
    expect(rows).toHaveLength(2)
    press(rows[0])
    expect(props.onUpgrade).toHaveBeenCalledTimes(1)
  })
})
