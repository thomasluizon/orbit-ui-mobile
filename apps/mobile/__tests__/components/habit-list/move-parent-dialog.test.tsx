import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, View } from 'react-native'
import {
  MoveParentDialog,
  type MoveParentOption,
} from '@/components/habit-list/move-parent-dialog'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'
import { focusHost, withFocusProvenance } from '../../support/focus-provenance'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

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
    return flattenRenderedText((node).children)
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
  void TestRenderer.act(() => {
    tree = TestRenderer.create(
      withFocusProvenance(<MoveParentDialog {...props} />),
    ) as unknown as RenderedTree
  })
  if (!tree) throw new Error('Expected move-parent dialog to render')
  return { tree, props }
}

function findOptionRows(tree: RenderedTree): RenderedNode[] {
  return tree.root.findAll(
    (node) =>
      (node.type === Pressable || node.type === View) &&
      node.props.accessibilityRole === 'radio' &&
      typeof node.props.accessibilityState === 'object' &&
      node.props.accessibilityState !== null &&
      'checked' in (node.props.accessibilityState as Record<string, unknown>),
  )
}

function findSearchInputs(tree: RenderedTree): RenderedNode[] {
  return tree.root.findAll(
    (node) =>
      node.props.placeholder === 'habits.moveParent.searchPlaceholder' &&
      typeof node.props.onChangeText === 'function',
  )
}

describe('MoveParentDialog', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })

  it('presents as a sheet with the move-parent title', () => {
    const { tree } = renderDialog()

    const sheets = tree.root.findAll(
      (node) => node.type === 'Sheet',
    )
    expect(sheets.length).toBeGreaterThan(0)
    expect(sheets[0]!.props.title).toBe('habits.moveParent.title')
  })

  it('selects an option when its row is pressed and exposes disabled rows', () => {
    const { tree, props } = renderDialog({ selectedMoveParentId: 'elsewhere' })

    const rows = findOptionRows(tree)
    expect(rows.length).toBeGreaterThan(0)

    void TestRenderer.act(() => {
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
          ((node.props.accessibilityState as Record<string, unknown> | undefined) ??
            {}),
    )
    const confirmPill = footerPills.find((pill) =>
      flattenInstanceText(pill).includes('habits.moveParent.confirm'),
    )
    if (!confirmPill) throw new Error('Expected the confirm pill')

    void TestRenderer.act(() => {
      ;(confirmPill.props.onPress as () => void)()
    })
    expect(props.onConfirm).toHaveBeenCalled()
  })

  it('renders a selectable root row even with no destinations', () => {
    const { tree, props } = renderDialog({
      options: [makeOption({ id: null, label: 'Top level' })],
      selectedMoveParentId: 'elsewhere',
    })

    const rows = findOptionRows(tree)
    expect(rows.length).toBeGreaterThan(0)
    expect(flattenRenderedText(tree.toJSON())).not.toContain(
      'habits.moveParent.destinations',
    )

    void TestRenderer.act(() => {
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
    expect(findSearchInputs(few)).toHaveLength(0)

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

    void TestRenderer.act(() => {
      ;(searchInput.props.onChangeText as (value: string) => void)('bravo')
    })

    const rendered = flattenRenderedText(tree.toJSON())
    expect(rendered).toContain('Alpha')
    expect(rendered).toContain('Bravo')
    expect(rendered).not.toContain('Zeta')
  })

  it('keeps native focus traversal in rendered order after filtered rows return', () => {
    const options: MoveParentOption[] = [
      makeOption({ id: null, label: 'Top level' }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeOption({ id: `zeta${index}`, label: `Zeta ${index}` }),
      ),
    ]
    const { tree, props } = renderDialog({ options })
    const searchInput = findSearchInputs(tree)[0]
    if (!searchInput) throw new Error('Expected the search field')

    void TestRenderer.act(() => {
      ;(searchInput.props.onChangeText as (value: string) => void)('Zeta 5')
    })
    void TestRenderer.act(() => {
      ;(findSearchInputs(tree)[0]!.props.onChangeText as (value: string) => void)('')
    })
    const rows = findOptionRows(tree).filter(
      (row) => row.type === Pressable && flattenInstanceText(row).includes('Zeta'),
    )
    expect(rows.map(flattenInstanceText)).toEqual(
      Array.from({ length: 9 }, (_, index) => `⭐️Zeta ${index}`),
    )
    expect(rows.every((row) => row.props.focusable === true)).toBe(true)
    expect(rows.every((row) => row.props.onKeyDown === undefined)).toBe(true)
    const zetaFive = rows[5]
    if (!zetaFive) throw new Error('Expected Zeta 5')

    void TestRenderer.act(() => {
      ;(zetaFive.props.onPress as () => void)()
    })

    expect(props.onSelectOption).toHaveBeenLastCalledWith('zeta5')
  })

  it('keeps entry on the receiving destination without changing selection', () => {
    const options = [
      makeOption({ id: null, label: 'Top level' }),
      makeOption({ id: 'alpha', label: 'Alpha' }),
      makeOption({ id: 'bravo', label: 'Bravo' }),
    ]
    const { tree, props } = renderDialog({ options, selectedMoveParentId: null })
    const rows = findOptionRows(tree)

    void TestRenderer.act(() => {
      focusHost(tree, rows[1]!)
    })

    expect(props.onSelectOption).not.toHaveBeenCalled()
    expect((rows[0]!.props.accessibilityState as { checked: boolean }).checked).toBe(true)
    expect((rows[1]!.props.accessibilityState as { checked: boolean }).checked).toBe(false)
  })

  it('selects a destination when focus moves within the group', () => {
    const options = [
      makeOption({ id: null, label: 'Top level' }),
      makeOption({ id: 'alpha', label: 'Alpha' }),
      makeOption({ id: 'bravo', label: 'Bravo' }),
    ]
    const { tree, props } = renderDialog({ options, selectedMoveParentId: null })
    const rows = findOptionRows(tree)

    void TestRenderer.act(() => {
      focusHost(tree, rows[0]!)
      focusHost(tree, rows[1]!)
    })

    expect(props.onSelectOption).toHaveBeenCalledExactlyOnceWith('alpha')
  })

  it('leaves directional focus to the platform between Top level and the first destination', () => {
    const options = [
      makeOption({ id: null, label: 'Top level' }),
      makeOption({ id: 'alpha', label: 'Alpha' }),
    ]
    const { tree, props } = renderDialog({ options, selectedMoveParentId: null })
    const [root, firstDestination] = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    expect([root!.props.focusable, firstDestination!.props.focusable]).toEqual([true, true])
    for (const direction of ['nextFocusDown', 'nextFocusLeft', 'nextFocusRight', 'nextFocusUp']) {
      expect(root!.props[direction]).toBeUndefined()
      expect(firstDestination!.props[direction]).toBeUndefined()
    }

    void TestRenderer.act(() => {
      focusHost(tree, root as never)
      focusHost(tree, firstDestination as never)
    })
    expect(props.onSelectOption).toHaveBeenCalledExactlyOnceWith('alpha')
  })

  it('locks the sheet and swaps to the moving label while pending', () => {
    const { tree } = renderDialog({ isPending: true })

    const sheets = tree.root.findAll(
      (node) => node.type === 'Sheet',
    )
    expect(sheets[0]!.props.onClose).toBeUndefined()

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
