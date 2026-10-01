import React from 'react'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { Icon } from '@/components/ui/icon'
import { createTokensV2 } from '@/lib/theme'
import { StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { Menu } from '@/components/ui/menu'
import { Checkbox } from '@/components/ui/icons'
import { useUIStore } from '@/stores/ui-store'

const theme = vi.hoisted<{ mode: 'dark' | 'light' }>(() => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }),
}))

vi.unmock('@/components/ui/sheet')

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode }> {
    present = vi.fn(() => Promise.resolve())
    dismiss = vi.fn(() => Promise.resolve())
    render() {
      return this.props.children ?? null
    }
  },
}))

const TestRenderer = require('react-test-renderer')

const items = [
  { id: 'delete', label: 'Delete', destructive: true },
  { id: 'edit', label: 'Edit' },
] as const

function menuItemLabels(tree: any): string[] {
  return tree.root
    .findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem')
    .map((node: any) => node.findByType('Text').props.children)
}

describe('Menu (mobile)', () => {
  it.each((['dark', 'light'] as const).flatMap((mode) =>
    (['sheet', 'anchored'] as const).map((presentation) => ({ mode, presentation }))))(
    'keeps danger colours and changes only fill when pressed in $mode $presentation',
    async ({ mode, presentation }) => {
      theme.mode = mode
      const tokens = createTokensV2('orange', mode)
      let tree!: ReactTestRenderer
      await TestRenderer.act(async () => {
        const menuPresentation = presentation === 'sheet'
          ? { presentation: 'sheet' as const }
          : { presentation: 'anchored' as const, anchorRef: React.createRef() }
        tree = TestRenderer.create(<Menu open {...menuPresentation} items={[
          { id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
          { id: 'disabled', label: 'Unavailable', icon: 'trash', destructive: true, disabled: true },
        ]} />)
        await Promise.resolve()
      })
      const rows = tree.root.findAll((node: ReactTestInstance) =>
        String(node.type) === 'Pressable' && node.props.accessibilityRole === 'menuitem')
      const remove = rows[0]!
      expect(remove.findAll((node) => node.type === Icon)[0]!.props.color).toBe(tokens.statusBad)
      expect(StyleSheet.flatten(remove.findAll((node) => node.type === Text)[0]!.props.style as StyleProp<TextStyle>).color).toBe(tokens.statusBadText)
      const rowStyle = remove.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
      const resting = StyleSheet.flatten(rowStyle({ pressed: false }))
      const pressed = StyleSheet.flatten(rowStyle({ pressed: true }))
      expect(pressed).toEqual({ ...resting, backgroundColor: tokens.bgHover })
      expect(rows[1]!.props.disabled).toBe(true)
      await TestRenderer.act(() => tree.update(<></>))
      theme.mode = 'dark'
    },
  )

  it('matches menu icon stroke to medium-weight labels', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Menu open title="List options" items={[{ id: 'select', label: 'Select', icon: 'checkbox' }]} />)
      await Promise.resolve()
    })
    expect(tree.root.findByType(Checkbox).props.strokeWidth).toBe(2)
    await TestRenderer.act(() => tree.unmount())
  })

  it('uses a sheet at 412 and keeps the destructive item last', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Menu open title="Habit actions" items={items} />)
      await Promise.resolve()
    })
    expect(menuItemLabels(tree)).toEqual(['Edit', 'Delete'])
    const rows = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem')
    expect(rows.map((row: any) => StyleSheet.flatten(row.props.style({ pressed: false })).minHeight)).toEqual([56, 56])
    expect(rows.map((row: any) => StyleSheet.flatten(row.props.style({ pressed: false })).height)).toEqual([undefined, undefined])
    expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
    const sheet = tree.root.findAll((node: any) => node.type?.name === 'TrueSheet')[0]
    if (!sheet) throw new Error('Sheet presentation did not render its native backdrop')
    expect(sheet.props.dimmed).toBe(true)
    await TestRenderer.act(() => tree.unmount())
  })

  it('uses the anchored presentation when explicitly selected and reports one id', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const anchorRef = {
      current: {
        measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
          callback(100, 100, 44, 44),
      },
    }
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Menu
          open
          presentation="anchored"
          anchorRef={anchorRef}
          items={items}
          onSelect={onSelect}
          onClose={onClose}
        />,
      )
      await Promise.resolve()
    })
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1)
    const wideRows = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem')
    expect(wideRows.map((row: any) => StyleSheet.flatten(row.props.style({ pressed: false })).minHeight)).toEqual([48, 48])
    expect(wideRows.map((row: any) => StyleSheet.flatten(row.props.style({ pressed: false })).height)).toEqual([undefined, undefined])

    const edit = tree.root
      .findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem')
      .find((node: any) => node.findByType('Text').props.children === 'Edit')
    TestRenderer.act(() => edit.props.onPress())
    expect(onSelect).toHaveBeenCalledWith('edit')
    expect(onSelect.mock.calls[0]).toHaveLength(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    const catcher = tree.root.findAll((node: any) => (
      node.type === 'Pressable' && node.props.accessibilityElementsHidden === true
    ))[0]
    if (!catcher) throw new Error('Anchored menu catcher did not render')
    expect(StyleSheet.flatten(catcher.props.style).backgroundColor).toBe('transparent')
    await TestRenderer.act(() => tree.unmount())
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0)
  })
})
