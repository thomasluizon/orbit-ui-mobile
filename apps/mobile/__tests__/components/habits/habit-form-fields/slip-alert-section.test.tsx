import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlipAlertSection } from '@/components/habits/habit-form-fields/slip-alert-section'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/habits/habit-form-fields/styles', () => ({
  createSectionStyles: () => ({
    container: {},
    headerRow: {},
    headerLeft: {},
    headerLabel: {},
    slipDescription: {},
  }),
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: (props: Record<string, unknown>) => React.createElement('Switch', props),
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => React.createElement('ProBadge'),
}))

describe('SlipAlertSection (mobile)', () => {
  const tokens = { fg2: '#222', fg3: '#777' } as never

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes a free account to upgrade without toggling', () => {
    const onToggle = vi.fn()
    const onUpgrade = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <SlipAlertSection
          tokens={tokens}
          hasProAccess={false}
          slipAlertEnabled={false}
          onToggle={onToggle}
          onUpgrade={onUpgrade}
        />,
      )
    })

    const upgradeRow = tree.root.findAll(
      (node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
    )[0]
    TestRenderer.act(() => upgradeRow.props.onPress())

    expect(onUpgrade).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
    expect(tree.root.findAll((node: any) => node.type === 'Switch')).toHaveLength(0)
  })

  it('lets a Pro account toggle the real switch', () => {
    const onToggle = vi.fn()
    const onUpgrade = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <SlipAlertSection
          tokens={tokens}
          hasProAccess
          slipAlertEnabled={false}
          onToggle={onToggle}
          onUpgrade={onUpgrade}
        />,
      )
    })

    const toggle = tree.root.findAll((node: any) => node.type === 'Switch')[0]
    TestRenderer.act(() => toggle.props.onChange())

    expect(onToggle).toHaveBeenCalledOnce()
    expect(onUpgrade).not.toHaveBeenCalled()
  })
})
