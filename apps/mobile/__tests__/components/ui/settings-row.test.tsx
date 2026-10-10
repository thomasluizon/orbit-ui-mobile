import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'

import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BarChart3, Home } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
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
    const track = control.findAll((node: { props: Record<string, unknown> }) => node.props['data-slot'] === 'switch-track')[0]
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
    TestRenderer.act(() => { tree = TestRenderer.create(<ListRow textMode="label" title="Account" onClick={() => {}} />) })
    const row = tree.root.find((node: any) => node.props.accessibilityRole === 'button' && node.findAllByProps({ children: 'Account' }).length > 0)
    const pressed = StyleSheet.flatten(row.props.style({ pressed: true }))
    expect(pressed).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: createTokensV2('purple', 'dark').bgHover })
  })

  it('draws the canonical ListRow leading icon geometry', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ListRow textMode="label" title="Account" icon={<Home size={24} strokeWidth={1.5} />} chevron={false} />,
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
    await act(() => { tree = create(<ListRow textMode="label" title={title} icon={<BarChart3 size={24} />} toggle={{ checked: true, onChange: () => {} }} />) as typeof tree })
    try {
      const geometry = measureProfileRow(tree.toJSON(), 288, fontScale)
      const label = geometry.texts.find((text) => text.label === title)!
      const control = geometry.controls.filter((control) => control.accessibilityLabel === title).at(-1)!
      const track = geometry.parts.find((part) => part.slot === 'switch-track')!
      expect(control.height).toBeGreaterThanOrEqual(48)
      expect(label.clipped).toBe(false)
      if (label.lines === 1) {
        expect(Math.abs(label.top + label.height / 2 - control.top - control.height / 2)).toBeLessThanOrEqual(1)
        if (fontScale === 1) expect(geometry.height).toBe(52)
        else expect(geometry.height).toBeGreaterThan(52)
      } else {
        expect(fontScale).toBe(2)
        expect(Math.abs(label.top + label.height / label.lines / 2 - track.top - track.height / 2)).toBeLessThanOrEqual(1)
        expect(geometry.height).toBeGreaterThan(52)
      }
    } finally { await act(() => tree.update(<></>)) }
  })
})
