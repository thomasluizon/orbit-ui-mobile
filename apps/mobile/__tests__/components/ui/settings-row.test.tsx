import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: undefined }),
}))

import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { SettingsGroup } from '@/components/ui/settings-group'

const TestRenderer = require('react-test-renderer')

function separatorCount(tree: any): number {
  return tree.root.findAll(
    (node: any) =>
      typeof node.type === 'string' &&
      node.props.testID === 'settings-group-separator',
  ).length
}

describe('SettingsGroup', () => {
  it('separates adjacent rows but never trails a rule after the last one', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <SettingsGroup>
          <SettingsRow label="Language" accessory="none" />
          <SettingsRow label="Theme" accessory="none" />
          <SettingsRow label="Week start" accessory="none" />
        </SettingsGroup>,
      )
    })

    expect(separatorCount(tree)).toBe(2)
  })

  it('draws no separator for a single-row group', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <SettingsGroup>
          <SettingsRow label="Language" accessory="none" />
        </SettingsGroup>,
      )
    })

    expect(separatorCount(tree)).toBe(0)
  })

  it('draws no rule of its own, so a standalone row sits flat', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(<SettingsRow label="Language" accessory="none" />)
    })

    expect(separatorCount(tree)).toBe(0)
  })
})

describe('Switch', () => {
  it('fires onToggle when pressed', () => {
    const onToggle = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch on={false} onToggle={onToggle} accessibilityLabel="Dark theme" />,
      )
    })

    const control = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'switch',
    )
    expect(control.props.accessibilityLabel).toBe('Dark theme')
    expect(control.props.accessibilityState).toEqual({ checked: false, disabled: false })

    TestRenderer.act(() => {
      control.props.onPress()
    })

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('exposes the on state as checked', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch on onToggle={() => {}} accessibilityLabel="Dark theme" />,
      )
    })

    const control = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'switch',
    )
    expect(control.props.accessibilityState).toEqual({ checked: true, disabled: false })
  })
})
