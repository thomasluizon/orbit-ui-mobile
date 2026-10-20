import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, View } from 'react-native'
import {
  MoveParentDialog,
  type MoveParentOption,
} from '@/components/habit-list/move-parent-dialog'
import { __resetTestHostConfig, __setScrollToImpl } from '../../../test-mocks/react-native'
import { Sheet as SheetDouble } from '@/__tests__/support/sheet-double'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { focusHost, withFocusProvenance } from '../../support/focus-provenance'
import { measureProfileRow } from '../../support/profile-row-geometry'

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
  update: ReturnType<typeof TestRenderer.create>['update']
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
  if (typeof node === 'object' && 'props' in node && (node as { props: { importantForAccessibility?: string } }).props.importantForAccessibility === 'no-hide-descendants') return ''
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

  it('pins Cancel and Move in the sheet footer, never in the scrolling body', async () => {
    const { tree } = renderDialog()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['common.cancel', 'habits.moveParent.confirm'])
    expectSmallSheetActions(tree.root)
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual(['Blocked branch'])
    const disclosure = tree.root.findAll((node) => node.type === Pressable && node.props.accessibilityLabel === 'Blocked branch')[0]!
    await TestRenderer.act(() => { (disclosure.props.onPress as () => void)() })
    expect(disclosure.props.accessibilityState).toMatchObject({ expanded: true })
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
      Array.from({ length: 9 }, (_, index) => `Zeta ${index}`),
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

  it('keeps a disabled destination out of the focus order and out of selection', () => {
    const options = [
      makeOption({ id: null, label: 'Top level' }),
      makeOption({ id: 'alpha', label: 'Alpha', disabled: true, reason: 'Too deep' }),
      makeOption({ id: 'bravo', label: 'Bravo' }),
    ]
    const { tree, props } = renderDialog({ options, selectedMoveParentId: null })
    const [root, blocked, bravo] = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    expect([root!.props.focusable, blocked!.props.focusable, bravo!.props.focusable])
      .toEqual([true, false, true])
    expect(blocked!.props.onPress).toBeUndefined()

    void TestRenderer.act(() => {
      focusHost(tree, root as never)
      focusHost(tree, bravo as never)
    })

    expect(props.onSelectOption).toHaveBeenCalledExactlyOnceWith('bravo')
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

  it('locks the sheet and keeps the Move label while pending', () => {
    const { tree: idle } = renderDialog()
    expect(idle.root.findAll((node) => node.type === SheetDouble)[0]!.props.onClose).toBeTypeOf('function')

    const { tree } = renderDialog({ isPending: true })

    const sheets = tree.root.findAll(
      (node) => node.type === SheetDouble,
    )
    expect(sheets[0]!.props.onClose).toBeUndefined()

    expect(flattenRenderedText(tree.toJSON())).toContain('habits.moveParent.confirm')
    expect(flattenRenderedText(tree.toJSON())).not.toContain('habits.moveParent.moving')

    const busyButtons = tree.root.findAll(
      (node) =>
        (node.props.accessibilityState as { busy?: boolean } | undefined)
          ?.busy === true,
    )
    expect(busyButtons.length).toBeGreaterThan(0)
  })
})


describe('move picker initial positioning', () => {
  beforeEach(() => __resetTestHostConfig())

  it('scrolls once without animation and resets to zero after a search keystroke', async () => {
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    const options = [makeOption({ id: null, label: 'Top level' }),
      ...Array.from({ length: 12 }, (_, index) => makeOption({ id: `p${index}`, label: `Parent ${index}` }))]
    const { tree } = renderDialog({ options, movingHabitParentId: 'p9' })
    const layouts = tree.root.findAll((node) => node.type === View && String(node.props.testID).startsWith('move-target-'))
    await TestRenderer.act(() => {
      layouts.forEach((row, index) => (row.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { y: index * 64 + 4, height: 60 } } }))
    })
    expect(scrollTo).not.toHaveBeenCalled()
    const scroll = tree.root.findAll((node) => node.type === 'ScrollView' && node.props.testID === 'move-destinations-scroll')[0]!
    await TestRenderer.act(() => {
      (scroll.props.onLayout as () => void)()
      expect(scrollTo).not.toHaveBeenCalled()
      ;(scroll.props.onContentSizeChange as () => void)()
    })
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 520, animated: false })
    await TestRenderer.act(() => {
      (findSearchInputs(tree)[0]!.props.onChangeText as (query: string) => void)('Parent')
    })
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false })
  })

  it('opens root at zero and uses the plural title and inline error region', async () => {
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    const { tree } = renderDialog({ movingHabitParentId: null, movingHabitCount: 100, error: '2 habits did not move' })
    const scroll = tree.root.findAll((node) => node.type === 'ScrollView' && node.props.testID === 'move-destinations-scroll')[0]!
    await TestRenderer.act(() => { (scroll.props.onLayout as () => void)(); (scroll.props.onContentSizeChange as () => void)() })
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false })
    expect(flattenRenderedText(tree.toJSON())).not.toContain('habits.moveParent.descriptionMany')
    expect(flattenRenderedText(tree.toJSON())).toContain('2 habits did not move')
    expect(tree.root.findAll((node) => node.type === 'Sheet')[0]!.props.title).toBe('habits.moveParent.titleMany')
  })
})


describe('bulk move translated footer styles', () => {
  it.each([{ locale: 'en', messages: en, expected: 'Move 100 habits' },
    { locale: 'pt-BR', messages: ptBR, expected: 'Mover 100 hábitos' }])('keeps intrinsic pills for $locale with three digits', ({ messages, expected }) => {
    const t = (key: string, params?: Record<string, unknown>) => {
      let value: unknown = messages
      for (const segment of key.split('.')) value = (value as Record<string, unknown>)[segment]
      return String(value).replaceAll('{count}', String(params?.count))
    }
    const { tree } = renderDialog({ t, movingHabitCount: 100 })
    expect(tree.root.findAll((node) => node.type === 'Sheet')[0]!.props.title).toBe(expected)
    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual([messages.common.cancel, messages.habits.moveParent.confirm])
    expect(flattenRenderedText(tree.toJSON())).not.toContain(messages === en ? 'Choose where to place the selected habits' : 'Escolha onde colocar os hábitos selecionados')
    expectSmallSheetActions(tree.root)
  })
})

it.each([320, 412])('keeps the empty live region out of native picker spacing at %s', async (width) => {
  const { tree, props } = renderDialog({ movingHabitCount: 12 })
  type Host = Parameters<typeof measureProfileRow>[0]
  function findBody(host: Host): Host | undefined {
    if (host.type === 'SheetBody') return host
    return host.children?.filter((child): child is Host => typeof child !== 'string')
      .map(findBody).find((child) => child !== undefined)
  }
  function contentGeometry() {
    const host = tree.toJSON() as Host
    const body = findBody(host)!
    const content = body.children![0] as Host
    return { content, measured: measureProfileRow(content, width - 48, 1) }
  }
  const before = contentGeometry()
  const withoutStatus = { ...before.content, children: before.content.children!.filter((child) =>
    typeof child === 'string' || !('accessibilityLiveRegion' in child.props)) }
  expect(before.measured.height).toBe(measureProfileRow(withoutStatus, width - 48, 1).height)
  const region = tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite')[0]!
  await TestRenderer.act(() => {
    tree.update(withFocusProvenance(<MoveParentDialog {...props} error="Some habits did not move. Pick a place and try again." />))
  })
  expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite')[0]).toBe(region)
  const after = contentGeometry().measured
  const beforeRoot = before.measured.controls.find((control) => control.labels.includes('Top level'))!
  const afterRoot = after.controls.find((control) => control.labels.includes('Top level'))!
  expect(afterRoot.top).toBe(beforeRoot.top)
  expect(after.height).toBeGreaterThan(before.measured.height)
  expect(after.texts.some((text) => text.label === 'Some habits did not move. Pick a place and try again.')).toBe(true)
})


it('clears a picker search after successful confirmation before reopening', async () => {
  const { tree, props } = renderDialog({ options: Array.from({ length: 12 }, (_, index) => makeOption({ id: `p${index}`, label: `Parent ${index}` })),
    onConfirm: vi.fn().mockResolvedValue(true) })
  await TestRenderer.act(() => { (findSearchInputs(tree)[0]!.props.onChangeText as (query: string) => void)('Parent 1') })
  const confirm = tree.root.findAll((node) => node.props.accessibilityRole === 'button'
    && typeof node.props.onPress === 'function' && flattenInstanceText(node).includes('habits.moveParent.confirm')).at(-1)!
  await TestRenderer.act(async () => { (confirm.props.onPress as () => void)(); await Promise.resolve() })
  expect(props.onClose).toHaveBeenCalledOnce()
  expect(findSearchInputs(tree)[0]!.props.value).toBe('')
})
