import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => null,
}))

import { createTokensV2 } from '@/lib/theme'
import { createStyles as createSectionStyles } from '@/app/ai-settings-styles'
import {
  AiFeatureToggles,
  FactsSelectBar,
  UserFactsList,
} from '@/app/ai-settings-sections'
import type { UserFact } from '@/app/use-user-facts'

const TestRenderer = require('react-test-renderer')

const tokens = createTokensV2('purple', 'dark')
const styles = createSectionStyles()
const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${JSON.stringify(params)})` : key

interface TestNode {
  type: unknown
  props: Record<string, unknown>
}

type TestTree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] }
}

const PROACTIVE_LABEL = 'profile.proactiveAstra.title'

function baseProps() {
  return {
    tokens,
    t: translate,
    hasProAccess: true,
    aiMemoryEnabled: true,
    aiSummaryEnabled: true,
    proactiveAstraEnabled: false,
    memoryPending: false,
    summaryPending: false,
    proactivePending: false,
    onToggleMemory: vi.fn(),
    onToggleSummary: vi.fn(),
    onToggleProactive: vi.fn(),
    onUpgrade: vi.fn(),
  }
}

function renderToggles(props: ReturnType<typeof baseProps>): TestTree {
  let tree: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(<AiFeatureToggles {...props} />)
  })
  return tree!
}

function render(element: React.ReactElement): TestTree {
  let tree: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree!
}

function switches(tree: TestTree): TestNode[] {
  return tree.root.findAll(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'switch',
  )
}

function findNode(
  tree: TestTree,
  role: string,
  label: string,
): TestNode | undefined {
  return tree.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === role &&
      node.props.accessibilityLabel === label,
  )[0]
}

function press(node: TestNode | undefined) {
  TestRenderer.act(() => {
    ;(node?.props.onPress as (() => void) | undefined)?.()
  })
}

function exercisePressCallbacks(tree: TestTree) {
  for (const node of tree.root.findAll(() => true)) {
    const style = node.props.style
    if (typeof style === 'function') {
      style({ pressed: true })
      style({ pressed: false })
    }
    const children = node.props.children
    if (typeof children === 'function') {
      ;(children as (state: { pressed: boolean }) => unknown)({ pressed: true })
    }
  }
}

function texts(tree: TestTree): unknown[] {
  return tree.root
    .findAll((node) => node.type === 'Text')
    .map((node) => node.props.children)
}

describe('mobile AiFeatureToggles', () => {
  it('renders a proactive-check-ins switch reflecting its off state for Pro users', () => {
    const tree = renderToggles(baseProps())
    expect(switches(tree)).toHaveLength(3)

    const proactive = findNode(tree, 'switch', PROACTIVE_LABEL)
    expect(proactive).toBeDefined()
    expect(
      (proactive?.props.accessibilityState as { checked?: boolean }).checked,
    ).toBe(false)
  })

  it('calls onToggleProactive when the proactive switch is pressed', () => {
    const props = baseProps()
    const tree = renderToggles(props)
    press(findNode(tree, 'switch', PROACTIVE_LABEL))
    expect(props.onToggleProactive).toHaveBeenCalledTimes(1)
  })

  it('locks the proactive row behind an upgrade prompt for non-pro users', () => {
    const props = { ...baseProps(), hasProAccess: false }
    const tree = renderToggles(props)
    expect(switches(tree)).toHaveLength(0)

    const lockedRow = findNode(tree, 'button', PROACTIVE_LABEL)
    expect(lockedRow).toBeDefined()
    press(lockedRow)
    expect(props.onUpgrade).toHaveBeenCalledTimes(1)
  })
})

function selectBarProps() {
  return {
    tokens,
    t: translate,
    styles,
    selectMode: false,
    selectedCount: 0,
    allSelected: false,
    bulkDeletePending: false,
    showPaging: false,
    page: 1,
    totalPages: 3,
    onPreviousPage: vi.fn(),
    onNextPage: vi.fn(),
    onToggleSelectAll: vi.fn(),
    onBulkDelete: vi.fn(),
    onToggleSelectMode: vi.fn(),
  }
}

describe('mobile FactsSelectBar', () => {
  it('shows the select entry point when idle and enters select mode on press', () => {
    const props = selectBarProps()
    const tree = render(<FactsSelectBar {...props} />)
    const selectButton = findNode(tree, 'button', 'profile.facts.select')
    expect(selectButton).toBeDefined()
    press(selectButton)
    expect(props.onToggleSelectMode).toHaveBeenCalledTimes(1)
    exercisePressCallbacks(tree)
  })

  it('renders paging controls and steps to the next page', () => {
    const props = { ...selectBarProps(), showPaging: true, page: 1 }
    const tree = render(<FactsSelectBar {...props} />)
    expect(texts(tree)).toContain('profile.facts.count({"n":1,"max":3})')
    press(findNode(tree, 'button', 'common.next'))
    expect(props.onNextPage).toHaveBeenCalledTimes(1)
    press(findNode(tree, 'button', 'common.previous'))
    expect(props.onPreviousPage).toHaveBeenCalledTimes(1)
    exercisePressCallbacks(tree)
  })

  it('disables the next control when on the last page', () => {
    const props = { ...selectBarProps(), showPaging: true, page: 3, totalPages: 3 }
    const tree = render(<FactsSelectBar {...props} />)
    expect(findNode(tree, 'button', 'common.next')?.props.disabled).toBe(true)
    exercisePressCallbacks(tree)
  })

  it('offers select-all and bulk-delete when items are selected', () => {
    const props = {
      ...selectBarProps(),
      selectMode: true,
      selectedCount: 2,
      allSelected: false,
    }
    const tree = render(<FactsSelectBar {...props} />)
    press(findNode(tree, 'button', 'profile.facts.selectAll'))
    expect(props.onToggleSelectAll).toHaveBeenCalledTimes(1)
    press(findNode(tree, 'button', 'profile.facts.deleteSelectedShort'))
    expect(props.onBulkDelete).toHaveBeenCalledTimes(1)
    press(findNode(tree, 'button', 'profile.facts.cancel'))
    expect(props.onToggleSelectMode).toHaveBeenCalledTimes(1)
    exercisePressCallbacks(tree)
  })

  it('switches select-all to deselect and hides bulk-delete when nothing is selected', () => {
    const props = {
      ...selectBarProps(),
      selectMode: true,
      selectedCount: 0,
      allSelected: true,
    }
    const tree = render(<FactsSelectBar {...props} />)
    expect(findNode(tree, 'button', 'profile.facts.deselectAll')).toBeDefined()
    expect(
      findNode(tree, 'button', 'profile.facts.deleteSelectedShort'),
    ).toBeUndefined()
    exercisePressCallbacks(tree)
  })
})

const factWithCategory: UserFact = {
  id: 'fact-1',
  factText: 'Prefers mornings',
  category: 'routine',
}
const factWithoutCategory: UserFact = {
  id: 'fact-2',
  factText: 'Drinks tea',
  category: null,
}

function listProps(overrides: Partial<React.ComponentProps<typeof UserFactsList>> = {}) {
  return {
    tokens,
    t: translate,
    styles,
    hasProAccess: true,
    factsQuery: { isLoading: false, error: null, refetch: vi.fn() },
    facts: [factWithCategory, factWithoutCategory],
    pagedFacts: [factWithCategory, factWithoutCategory],
    selectMode: false,
    selectedFactIds: new Set<string>(),
    onToggleSelection: vi.fn(),
    onDelete: vi.fn(),
    onAskAstra: vi.fn(),
    ...overrides,
  }
}

describe('mobile UserFactsList', () => {
  it('renders the locked hint for non-pro users', () => {
    const tree = render(<UserFactsList {...listProps({ hasProAccess: false })} />)
    expect(texts(tree)).toContain('profile.facts.lockedHint')
  })

  it('renders skeleton placeholders while loading', () => {
    const tree = render(
      <UserFactsList
        {...listProps({ factsQuery: { isLoading: true, error: null, refetch: vi.fn() } })}
      />,
    )
    expect(texts(tree)).toHaveLength(0)
  })

  it('surfaces an error state whose retry refetches', () => {
    const refetch = vi.fn()
    const tree = render(
      <UserFactsList
        {...listProps({
          factsQuery: { isLoading: false, error: new Error('boom'), refetch },
        })}
      />,
    )
    expect(texts(tree)).toContain('profile.facts.factsError')
    press(
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string' && node.props.accessibilityRole === 'button',
      )[0],
    )
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders an empty state that routes to Astra', () => {
    const onAskAstra = vi.fn()
    const tree = render(
      <UserFactsList {...listProps({ facts: [], pagedFacts: [], onAskAstra })} />,
    )
    expect(texts(tree)).toContain('profile.facts.empty')
    press(
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string' && node.props.accessibilityRole === 'button',
      )[0],
    )
    expect(onAskAstra).toHaveBeenCalledTimes(1)
  })

  it('lists facts with categories and deletes on the trash control', () => {
    const onDelete = vi.fn()
    const tree = render(<UserFactsList {...listProps({ onDelete })} />)
    const flatTexts = texts(tree)
    expect(flatTexts).toContain('Prefers mornings')
    expect(flatTexts).toContain('Drinks tea')
    expect(
      flatTexts.some(
        (value) => typeof value === 'string' && value.startsWith('PROFILE.FACTS.'),
      ),
    ).toBe(true)
    press(findNode(tree, 'button', 'profile.facts.delete'))
    expect(onDelete).toHaveBeenCalledWith('fact-1')
    exercisePressCallbacks(tree)
  })

  it('toggles selection when a card is pressed in select mode', () => {
    const onToggleSelection = vi.fn()
    const tree = render(
      <UserFactsList
        {...listProps({
          selectMode: true,
          selectedFactIds: new Set(['fact-1']),
          onToggleSelection,
        })}
      />,
    )
    const card = tree.root.findAll(
      (node) =>
        typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox',
    )[0]
    press(card)
    expect(onToggleSelection).toHaveBeenCalledWith('fact-1')
    exercisePressCallbacks(tree)
  })
})
