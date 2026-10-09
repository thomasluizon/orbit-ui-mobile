import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'

import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BarChart3, Home } from '@/components/ui/icons'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { createTokensV2 } from '@/lib/theme'

import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { measureProfileRow } from '../../support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

afterEach(__resetTestHostConfig)

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
  it('clips the pressed fill to its whole row hit area', () => {
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<SettingsRow label="Account" onPress={() => {}} />) })
    const row = tree.root.find((node: any) => node.props.accessibilityLabel === 'Account' && node.props.accessibilityRole === 'button')
    const pressed = StyleSheet.flatten(row.props.style({ pressed: true }))
    expect(pressed).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: createTokensV2('purple', 'dark').bgHover })
  })

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

describe('SettingsRow switch geometry', () => {
  it.each([1, 2])('centres usage analytics at font scale %s', async (fontScale) => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
    const title = ptBR.profile.analytics.title
    let tree!: ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
    await act(() => { tree = create(<SettingsRow label={title} icon={BarChart3} accessory="none" divider={false}>
      <Switch label={title} checked onChange={() => {}} />
    </SettingsRow>) as typeof tree })
    try {
      const geometry = measureProfileRow(tree.toJSON(), 288, fontScale)
      const label = geometry.texts.find((text) => text.label === title)!
      const control = geometry.controls.filter((control) => control.accessibilityLabel === title).at(-1)!
      expect(control.height).toBeGreaterThanOrEqual(48)
      expect(label.clipped).toBe(false)
      if (label.lines === 1) {
        expect(Math.abs(label.top + label.height / 2 - control.top - control.height / 2)).toBeLessThanOrEqual(1)
        expect(geometry.height).toBe(52)
      } else {
        expect(fontScale).toBe(2)
        expect(Math.abs(label.top - control.top)).toBeLessThanOrEqual(1)
        expect(geometry.height).toBeGreaterThan(52)
      }
    } finally { await act(() => tree.update(<></>)) }
  })
})
