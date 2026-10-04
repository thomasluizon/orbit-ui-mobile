import React from 'react'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { Icon } from '@/components/ui/icon'
import { createTokensV2 } from '@/lib/theme'
import { StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { Menu } from '@/components/ui/menu'
import { HabitRow } from '@/components/habits/habit-row'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { Checkbox } from '@/components/ui/icons'
import { useUIStore } from '@/stores/ui-store'

const theme = vi.hoisted<{ mode: 'dark' | 'light' }>(() => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }),
}))

vi.unmock('@/components/ui/sheet')
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; footer?: React.ReactNode }> {
    present = vi.fn(() => Promise.resolve())
    dismiss = vi.fn(() => Promise.resolve())
    render() {
      return <>{this.props.children}{this.props.footer}</>
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
  it('discloses the full name from a real habit row menu without an edit action', async () => {
    __setWindowDimensions({ width: 320, height: 900, scale: 1, fontScale: 2 })
    const title = 'Ler um capítulo inteiro do livro de história antes de dormir e anotar as ideias para conversar com meus amigos amanhã cedo.'
    const onDelete = vi.fn()
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title })} actions={{ onDelete }} />) })
    const more = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'habits.actions.more')[0]!
    await TestRenderer.act(() => (more.props.onPress as () => void)())
    const sheet = tree.root.findAll((node) => typeof node.type !== 'string' && node.type.name === 'TrueSheet')[0]!
    const header = sheet.props.header as React.ReactElement<{ children: React.ReactElement<{ onPress: () => void; children: React.ReactElement<{ numberOfLines?: number }> }>[] }>
    const titleButton = header.props.children[0]!
    expect(titleButton.props.children.props.numberOfLines).toBe(2)
    await TestRenderer.act(() => titleButton.props.onPress())
    const fullTitle = sheet.findAll((node) => node.type === Text && node.props.children === title)[0]!
    expect(fullTitle.props.numberOfLines).toBeUndefined()
    expect(fullTitle.props.selectable).toBe(true)
    expect(menuItemLabels(tree)).toContain('habits.actions.delete')
    expect(onDelete).not.toHaveBeenCalled()
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('discloses the original typed title even when a short heading is supplied', async () => {
    const title = 'Ler um capítulo inteiro do livro de história antes de dormir'
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<Menu open presentation="sheet" title={title} shortTitle="Ler" titleMode="typed" items={[{ id: 'edit', label: 'Edit' }]} />) })
    const sheet = tree.root.findAll((node) => typeof node.type !== 'string' && node.type.name === 'TrueSheet')[0]!
    const header = sheet.props.header as React.ReactElement<{ children: React.ReactElement<{ onPress: () => void; accessibilityLabel: string }>[] }>
    const trigger = header.props.children[0]!
    expect(trigger.props.accessibilityLabel).toBe(title)
    await TestRenderer.act(() => trigger.props.onPress())
    expect(sheet.findAll((node) => node.type === Text && node.props.children === title)).toHaveLength(1)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('renders one trailing action row through the real confirmation sheet', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<ConfirmSheet open destructive title="Delete" message="Clear alerts"
        confirmLabel="Delete" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    })
    try {
      const rows = tree.root.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'action-row')
      expect(rows).toHaveLength(1)
      expect(StyleSheet.flatten(rows[0]!.props.style)).toMatchObject({ justifyContent: 'flex-end', gap: 12 })
    } finally { await TestRenderer.act(() => tree.update(<></>)) }
  })
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

  it('names the native menu sheet after the trigger while showing a short heading', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Menu open title="List options" shortTitle="Options" items={items} />)
      await Promise.resolve()
    })
    const header = tree.root.findAll((node: ReactTestInstance) => typeof node.type !== 'string' && node.type.name === 'TrueSheet')[0]!.props.header as React.ReactElement<{
      accessibilityLabel?: string
      children: React.ReactElement<{ accessibilityLabel?: string; children?: React.ReactNode }>[]
    }>
    expect(header.props.accessibilityLabel).toBe('List options')
    expect(header.props.children[0]!.props.accessibilityLabel).toBe('List options')
    expect(header.props.children[0]!.props.children).toBe('Options')
    await TestRenderer.act(() => tree.update(<></>))
  })

  it.each([true, false])('announces a checked menu row as %s', async (checked) => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Menu open items={[{ id: 'recurring', label: 'Recurring habits', checked }]} />)
      await Promise.resolve()
    })
    const rows = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.props.accessibilityState).toEqual({ disabled: false, checked })
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('allows the full recurring label to grow at 200% text with a first-line check', async () => {
    __setWindowDimensions({ width: 320, height: 900, scale: 1, fontScale: 2 })
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Menu open items={[{ id: 'repeat', label: 'Mostrar hábitos que se repetem', checked: true }]} />)
    })
    const label = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Mostrar hábitos que se repetem')[0]!
    expect(label.props.numberOfLines).toBeUndefined()
    const row = tree.root.findAll((node) => String(node.type) === 'Pressable' && (node.props.accessibilityState as { checked?: boolean } | undefined)?.checked === true)[0]!
    expect(StyleSheet.flatten((row.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>)({ pressed: false })).alignItems).toBe('flex-start')
    await TestRenderer.act(() => tree.update(<></>))
    __setWindowDimensions({ width: 412, height: 900, scale: 1, fontScale: 1 })
  })

  it('matches menu icon stroke to medium-weight labels', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Menu open title="List options" items={[{ id: 'select', label: 'Select', icon: 'checkbox' }]} />)
      await Promise.resolve()
    })
    expect(tree.root.findByType(Checkbox).props.strokeWidth).toBe(2)
    await TestRenderer.act(() => tree.update(<></>))
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
    const sheet = tree.root.findAll((node: any) => typeof node.type !== 'string' && node.type.name === 'TrueSheet')[0]
    if (!sheet) throw new Error('Sheet presentation did not render its native backdrop')
    expect(sheet.props.dimmed).toBe(true)
    await TestRenderer.act(() => tree.update(<></>))
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
    await TestRenderer.act(() => tree.update(<></>))
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0)
  })
})
