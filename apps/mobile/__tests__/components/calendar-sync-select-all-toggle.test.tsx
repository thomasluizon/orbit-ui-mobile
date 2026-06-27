import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', () => {
  const ReactModule = require('react')
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    ReactModule.createElement(name, props)
  return {
    CheckCheck: createIcon('CheckCheck'),
    SquareX: createIcon('SquareX'),
  }
})

import { createTokensV2 } from '@/lib/theme'
import { SelectAllToggle } from '@/app/calendar-sync-select-all-toggle'

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
