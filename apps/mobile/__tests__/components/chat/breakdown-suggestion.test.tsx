import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'

const bulkCreateMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({
    mutateAsync: bulkCreateMock,
    isPending: false,
  }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
    tintFromPrimary: () => 'rgba(127,70,247,0.1)',
  }
})

vi.mock('lucide-react-native', () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)
  return {
    Check: createIcon('Check'),
    X: createIcon('X'),
    Plus: createIcon('Plus'),
  }
})

const TestRenderer = require('react-test-renderer')

const subHabits: SuggestedSubHabit[] = [
  { title: 'Push-ups', description: '3 sets of 10' },
  { title: 'Squats', description: '3 sets of 15' },
]

const defaultProps = {
  parentName: 'Exercise',
  subHabits,
  onConfirmed: vi.fn(),
  onCancelled: vi.fn(),
}

function renderBreakdown() {
  let tree: { root: { findAll: (predicate: (node: { props?: Record<string, unknown>; type?: unknown }) => boolean) => { props: Record<string, unknown> }[] } } | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(<BreakdownSuggestion {...defaultProps} />)
  })
  if (!tree) throw new Error('failed to render')
  return tree
}

function findByAccessibilityLabel(tree: ReturnType<typeof renderBreakdown>, label: string) {
  return tree.root.findAll(
    (node) => node.props?.accessibilityLabel === label,
  )
}

function findInputByAccessibilityLabel(tree: ReturnType<typeof renderBreakdown>, label: string) {
  return tree.root.findAll(
    (node) =>
      node.props?.accessibilityLabel === label &&
      typeof node.props?.onChangeText === 'function',
  )
}

function collectText(children: unknown): string {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  if (Array.isArray(children)) {
    return children.map(collectText).join(' ')
  }
  if (typeof children === 'object' && 'props' in (children as { props?: unknown })) {
    return collectText((children as { props: { children?: unknown } }).props.children)
  }
  return ''
}

function pressableContainingText(
  tree: ReturnType<typeof renderBreakdown>,
  needle: string,
) {
  return tree.root
    .findAll(
      (node) =>
        typeof node.props?.onPress === 'function' && typeof node.type !== 'string',
    )
    .find((node) => collectText(node.props.children).includes(needle))
}

beforeEach(() => {
  defaultProps.onConfirmed.mockClear()
  defaultProps.onCancelled.mockClear()
  bulkCreateMock.mockReset()
  bulkCreateMock.mockResolvedValue(undefined)
})

describe('BreakdownSuggestion (mobile)', () => {
  it('labels each remove button with the habit name for screen readers', () => {
    const tree = renderBreakdown()
    expect(
      findByAccessibilityLabel(tree, 'habits.breakdown.removeHabit:{"name":"Push-ups"}').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('reveals the frequency-quantity editor only after a recurrence unit is chosen', () => {
    const tree = renderBreakdown()
    expect(
      findInputByAccessibilityLabel(tree, 'habits.breakdown.frequencyQuantityLabel').length,
    ).toBe(0)

    const chipWithWeekly = pressableContainingText(tree, 'habits.filter.weekly')
    expect(chipWithWeekly).toBeDefined()
    TestRenderer.act(() => {
      ;(chipWithWeekly!.props.onPress as () => void)()
    })

    expect(
      findInputByAccessibilityLabel(tree, 'habits.breakdown.frequencyQuantityLabel').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('shows the friendly i18n fallback instead of a raw Error message on failure', async () => {
    bulkCreateMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5432'))
    const tree = renderBreakdown()

    const submit = pressableContainingText(tree, 'habits.breakdown.createCount')
    expect(submit).toBeDefined()
    await TestRenderer.act(async () => {
      ;(submit!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })

    const errorNodes = tree.root.findAll((node) =>
      collectText(node.props?.children).includes('errors.bulkCreateHabits'),
    )
    expect(errorNodes.length).toBeGreaterThanOrEqual(1)
    const rawNodes = tree.root.findAll((node) =>
      collectText(node.props?.children).includes('ECONNREFUSED'),
    )
    expect(rawNodes.length).toBe(0)
  })
})
