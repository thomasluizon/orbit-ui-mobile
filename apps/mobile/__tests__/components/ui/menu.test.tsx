import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Menu } from '@/components/ui/menu'

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
  it('uses a sheet at 412 and keeps the destructive item last', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Menu open title="Habit actions" items={items} />)
      await Promise.resolve()
    })
    expect(menuItemLabels(tree)).toEqual(['Edit', 'Delete'])
    expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
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

    const edit = tree.root
      .findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem')
      .find((node: any) => node.findByType('Text').props.children === 'Edit')
    TestRenderer.act(() => edit.props.onPress())
    expect(onSelect).toHaveBeenCalledWith('edit')
    expect(onSelect.mock.calls[0]).toHaveLength(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
