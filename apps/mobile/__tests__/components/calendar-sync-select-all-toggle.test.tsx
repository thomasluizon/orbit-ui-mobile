import React from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { SelectAllToggle } from '@/components/calendar-sync/calendar-sync-select-all-toggle'

const TestRenderer = require('react-test-renderer')

const tokens = createTokensV2('purple', 'dark')
const selectAllLabel = 'Select all'
const deselectAllLabel = 'Deselect all'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
}

function renderToggle(allSelected: boolean, onToggle: () => void) {
  let tree: { root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] } }
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <SelectAllToggle
        allSelected={allSelected}
        onToggle={onToggle}
        selectAllLabel={selectAllLabel}
        deselectAllLabel={deselectAllLabel}
        tokens={tokens}
        tintStyle={undefined}
      />,
    )
  })
  return tree!
}

function getButton(tree: ReturnType<typeof renderToggle>) {
  const nodes = tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
  )
  return nodes[0]!
}

describe('mobile SelectAllToggle', () => {
  it('paints the whole target without invisible slop', () => {
    const button = getButton(renderToggle(false, vi.fn()))
    const style = button.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
    expect(button.props.hitSlop).toBeUndefined()
    expect(StyleSheet.flatten(style({ pressed: true }))).toMatchObject({ width: 44, height: 44, backgroundColor: tokens.bgHover })
  })

  it('exposes the select-all label when nothing is selected', () => {
    const tree = renderToggle(false, vi.fn())
    expect(getButton(tree).props.accessibilityLabel).toBe(selectAllLabel)
  })

  it('exposes the deselect-all label when everything is selected', () => {
    const tree = renderToggle(true, vi.fn())
    expect(getButton(tree).props.accessibilityLabel).toBe(deselectAllLabel)
  })

  it('calls onToggle when pressed', () => {
    const onToggle = vi.fn()
    const tree = renderToggle(false, onToggle)
    TestRenderer.act(() => {
      ;(getButton(tree).props.onPress as () => void)()
    })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
