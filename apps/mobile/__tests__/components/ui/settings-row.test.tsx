import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'

import { Home } from '@/components/ui/icons'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

describe('Switch', () => {
  it('fires onChange with the next state when pressed', () => {
    const onChange = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch checked={false} onChange={onChange} label="Dark theme" />,
      )
    })

    const control = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'switch',
    )
    expect(control.props.accessibilityLabel).toBe('Dark theme')
    expect(control.props.accessibilityState).toEqual({ checked: false })
    const track = control.findAllByType('View')[0]
    expect(track.props.style[1].backgroundColor).toBe(createTokensV2('purple', 'dark').trackEmpty)

    TestRenderer.act(() => {
      control.props.onPress()
    })

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('exposes the on state as checked', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch checked onChange={() => {}} label="Dark theme" />,
      )
    })

    const control = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'switch',
    )
    expect(control.props.accessibilityState).toEqual({ checked: true })
  })
})

describe('SettingsRow', () => {
  it('draws the canonical ListRow leading icon geometry', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <SettingsRow label="Account" icon={Home} accessory="none" />,
      )
    })

    const icon = tree.root.findByType('Home')
    const iconSlot = tree.root.findAllByType('View').find(
      (node: any) => StyleSheet.flatten(node.props.style)?.width === 28,
    )
    expect(icon.props.size).toBe(24)
    expect(icon.props.strokeWidth).toBe(1.5)
    expect(StyleSheet.flatten(iconSlot?.props.style)).toMatchObject({ width: 28 })
  })
})
