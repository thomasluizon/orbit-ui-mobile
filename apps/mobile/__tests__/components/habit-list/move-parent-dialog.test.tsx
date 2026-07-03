import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  MoveParentDialog,
  type MoveParentOption,
} from '@/components/habit-list/move-parent-dialog'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: (props: Record<string, unknown>) =>
    props.open
      ? React.createElement(
          'BottomSheetModal',
          props,
          props.children as React.ReactNode,
        )
      : null,
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    currentScheme: 'purple',
    currentTheme: 'dark',
  }),
}))

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
    return flattenRenderedText((node as { children: unknown }).children)
  }
  return ''
}

function flattenInstanceText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (typeof node === 'object' && 'children' in node) {
    const children = (node as { children: unknown[] }).children
    return children.map(flattenInstanceText).join('')
  }
  return ''
}

const defaultOptions: MoveParentOption[] = [
  {
    id: null,
    label: 'Top level',
    emoji: null,
    depth: 0,
    childCount: 0,
    disabled: false,
    reason: null,
  },
  {
    id: 'blocked',
    label: 'Blocked branch',
    emoji: '🚫',
    depth: 1,
    childCount: 0,
    disabled: true,
    reason: 'Too deep',
  },
]

function makeOption(overrides: Partial<MoveParentOption>): MoveParentOption {
  return {
    id: 'option',
    label: 'Option',
    emoji: '⭐️',
    depth: 0,
    childCount: 0,
    disabled: false,
    reason: null,
    ...overrides,
  }
}

function renderDialog(
  overrides: Partial<Parameters<typeof MoveParentDialog>[0]> = {},
) {
  const props = {
    t: (key: string) => key,
    visible: true,
    isPending: false,
    movingHabitTitle: 'Exercise',
    movingHabitParentId: null,
    options: defaultOptions,
    selectedMoveParentId: null,
    canSubmit: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onSelectOption: vi.fn(),
    ...overrides,
  }
  let tree: RenderedTree | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <MoveParentDialog {...props} />,
    ) as unknown as RenderedTree
  })
  if (!tree) throw new Error('Expected move-parent dialog to render')
  return { tree, props }
}

function findOptionRows(tree: RenderedTree): RenderedNode[] {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'radio' &&
      typeof node.props.accessibilityState === 'object' &&
      node.props.accessibilityState !== null &&
      'selected' in (node.props.accessibilityState as Record<string, unknown>),
  )
}

function findSearchInputs(tree: RenderedTree): RenderedNode[] {
  return tree.root.findAll(
    (node) => node.props.placeholder === 'habits.moveParent.searchPlaceholder',
  )
}

describe('MoveParentDialog', () => {
  it('presents as a sheet with the move-parent title', () => {
    const { tree } = renderDialog()

    const sheets = tree.root.findAll(
      (node) => node.type === 'BottomSheetModal',
    )
    expect(sheets.length).toBeGreaterThan(0)
    expect(sheets[0]!.props.title).toBe('habits.moveParent.title')
  })

  it('selects an option when its row is pressed and exposes disabled rows', () => {
    const { tree, props } = renderDialog()

    const rows = findOptionRows(tree)
    expect(rows.length).toBeGreaterThan(0)

    TestRenderer.act(() => {
      ;(rows[0]!.props.onPress as () => void)()
    })
    expect(props.onSelectOption).toHaveBeenCalledWith(null)

    expect(
      rows.some(
        (row) =>
          (row.props.accessibilityState as { disabled?: boolean }).disabled ===
          true,
      ),
    ).toBe(true)
  })

  it('confirms the move from the footer pill', () => {
    const { tree, props } = renderDialog()

    expect(flattenRenderedText(tree.toJSON())).toContain(
      'habits.moveParent.confirm',
    )

    const footerPills = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function' &&
        'busy' in
          ((node.props.accessibilityState as Record<string, unknown>) ?? {}),
    )
    const confirmPill = footerPills.find((pill) =>
      flattenInstanceText(pill).includes('habits.moveParent.confirm'),
    )
    if (!confirmPill) throw new Error('Expected the confirm pill')

    TestRenderer.act(() => {
      ;(confirmPill.props.onPress as () => void)()
    })
    expect(props.onConfirm).toHaveBeenCalled()
  })

  it('renders a selectable root row even with no destinations', () => {
    const { tree, props } = renderDialog({
      options: [makeOption({ id: null, label: 'Top level' })],
    })

    const rows = findOptionRows(tree)
    expect(rows.length).toBeGreaterThan(0)
    expect(flattenRenderedText(tree.toJSON())).not.toContain(
      'habits.moveParent.destinations',
    )

    TestRenderer.act(() => {
      ;(rows[0]!.props.onPress as () => void)()
    })
    expect(props.onSelectOption).toHaveBeenCalledWith(null)
  })

  it('shows the child count for a habit with children', () => {
    const { tree } = renderDialog({
      options: [
        makeOption({ id: null, label: 'Top level' }),
        makeOption({ id: 'parent', label: 'Parent', childCount: 12 }),
      ],
    })

    expect(flattenRenderedText(tree.toJSON())).toContain('12')
  })

  it('reveals the search field only when destinations exceed eight', () => {
    const { tree: few } = renderDialog()
    expect(findSearchInputs(few).length).toBe(0)

    const manyOptions: MoveParentOption[] = [
      makeOption({ id: null, label: 'Top level' }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `d${index}`, label: `Zeta ${index}` }),
      ),
    ]
    const { tree: many } = renderDialog({ options: manyOptions })
    expect(findSearchInputs(many).length).toBeGreaterThan(0)
  })

  it('filters the tree by search while keeping the ancestor chain', () => {
    const options: MoveParentOption[] = [
      makeOption({ id: null, label: 'Top level' }),
      makeOption({ id: 'alpha', label: 'Alpha', depth: 0, childCount: 1 }),
      makeOption({ id: 'bravo', label: 'Bravo', depth: 1 }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `zeta${index}`, label: `Zeta ${index}` }),
      ),
    ]
    const { tree } = renderDialog({ options })

    const searchInput = findSearchInputs(tree)[0]
    if (!searchInput) throw new Error('Expected the search field')

    TestRenderer.act(() => {
      ;(searchInput.props.onChangeText as (value: string) => void)('bravo')
    })

    const rendered = flattenRenderedText(tree.toJSON())
    expect(rendered).toContain('Alpha')
    expect(rendered).toContain('Bravo')
    expect(rendered).not.toContain('Zeta')
  })

  it('locks the sheet and swaps to the moving label while pending', () => {
    const { tree } = renderDialog({ isPending: true })

    const sheets = tree.root.findAll(
      (node) => node.type === 'BottomSheetModal',
    )
    expect(sheets[0]!.props.canDismiss).toBe(false)

    expect(flattenRenderedText(tree.toJSON())).toContain(
      'habits.moveParent.moving',
    )

    const busyButtons = tree.root.findAll(
      (node) =>
        (node.props.accessibilityState as { busy?: boolean } | undefined)
          ?.busy === true,
    )
    expect(busyButtons.length).toBeGreaterThan(0)
  })
})
