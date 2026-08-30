import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SelectionTray } from '@/components/habits/selection-tray'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: Record<string, unknown>
}

type RenderedTree = {
  root: {
    findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
  }
  toJSON: () => unknown
}

function flattenRenderedText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenRenderedText).join('')
  if (typeof node === 'object' && 'children' in node) {
    return flattenRenderedText(node.children)
  }
  return ''
}

async function renderBar(
  overrides: Partial<Parameters<typeof SelectionTray>[0]> = {},
) {
  const props = {
    count: 2,
    allSelected: false,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onLog: vi.fn(),
    onSkip: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    countSuffixLabel: 'selected',
    selectAllLabel: 'Select all',
    deselectAllLabel: 'Deselect all',
    logLabel: 'Log selected',
    skipLabel: 'Skip selected',
    deleteLabel: 'Delete selected',
    closeLabel: 'Cancel',
    ...overrides,
  }
  let tree: RenderedTree | undefined
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <SelectionTray {...props} />,
    ) as unknown as RenderedTree
  })
  if (!tree) throw new Error('Expected bulk action bar to render')
  return { tree, props }
}

function findButtonByLabel(tree: RenderedTree, label: string): RenderedNode {
  const matches = tree.root.findAll(
    (node) => node.props.accessibilityLabel === label,
  )
  if (matches.length === 0) throw new Error(`No button labeled ${label}`)
  return matches[0]!
}

describe('SelectionTray', () => {
  it('renders the tabular count beside the digit-free suffix', async () => {
    const { tree } = await renderBar({ count: 7, countSuffixLabel: 'selected' })

    const text = flattenRenderedText(tree.toJSON())
    expect(text).toContain('7')
    expect(text).toContain('selected')
  })

  it('disables log, skip, and delete at zero selection but keeps close active', async () => {
    const { tree } = await renderBar({ count: 0 })

    for (const label of ['Log selected', 'Skip selected', 'Delete selected']) {
      const button = findButtonByLabel(tree, label)
      expect(button.props.disabled).toBe(true)
      expect(
        (button.props.accessibilityState as { disabled: boolean }).disabled,
      ).toBe(true)
    }
    expect(findButtonByLabel(tree, 'Cancel').props.disabled).toBeFalsy()
  })

  it('fires the action handlers when pressed with a selection', async () => {
    const { tree, props } = await renderBar({ count: 3 })

    await TestRenderer.act(() => {
      ;(findButtonByLabel(tree, 'Log selected').props.onPress as () => void)()
      ;(findButtonByLabel(tree, 'Skip selected').props.onPress as () => void)()
      ;(findButtonByLabel(tree, 'Delete selected').props.onPress as () => void)()
      ;(findButtonByLabel(tree, 'Cancel').props.onPress as () => void)()
    })

    expect(props.onLog).toHaveBeenCalled()
    expect(props.onSkip).toHaveBeenCalled()
    expect(props.onDelete).toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows a select-all text control that selects everything', async () => {
    const { tree, props } = await renderBar({ allSelected: false })

    expect(flattenRenderedText(tree.toJSON())).toContain('Select all')

    const selectAllButton = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === undefined &&
        typeof node.props.onPress === 'function',
    )[0]
    if (!selectAllButton) throw new Error('Expected the select-all control')

    await TestRenderer.act(() => {
      ;(selectAllButton.props.onPress as () => void)()
    })
    expect(props.onSelectAll).toHaveBeenCalled()
  })

  it('swaps to a deselect-all text control when everything is selected', async () => {
    const { tree, props } = await renderBar({ allSelected: true })

    expect(flattenRenderedText(tree.toJSON())).toContain('Deselect all')

    const deselectAllButton = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === undefined &&
        typeof node.props.onPress === 'function',
    )[0]
    if (!deselectAllButton) throw new Error('Expected the deselect-all control')

    await TestRenderer.act(() => {
      ;(deselectAllButton.props.onPress as () => void)()
    })
    expect(props.onDeselectAll).toHaveBeenCalled()
  })
})
