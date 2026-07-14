import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  HabitListEmptyState,
  SkeletonCard,
  getEmptyHabitsMessage,
} from '@/components/habit-list/empty-state'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findAllByType(type: unknown): TestNode[]
}
interface TestTree {
  root: TestNode
  toJSON(): unknown
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

function render(element: React.ReactNode): TestTree {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function textStrings(tree: TestTree): string[] {
  return tree.root
    .findAllByType('Text')
    .flatMap((node) => {
      const children = node.props.children
      return Array.isArray(children) ? children : [children]
    })
    .filter((value): value is string => typeof value === 'string')
}

function pressableWithLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) =>
      node.props?.accessibilityRole === 'button' &&
      node.props?.accessibilityLabel === label,
  )[0]
}

describe('HabitListEmptyState', () => {
  it('renders the title and a distinct description', () => {
    const tree = render(
      <HabitListEmptyState title="No habits yet" description="Add one to begin" />,
    )
    const texts = textStrings(tree)
    expect(texts).toContain('No habits yet')
    expect(texts).toContain('Add one to begin')
  })

  it('omits the description when it duplicates the title', () => {
    const tree = render(
      <HabitListEmptyState title="Same" description="Same" />,
    )
    expect(textStrings(tree).filter((value) => value === 'Same')).toHaveLength(1)
  })

  it('stacks the Astra pill and the ghost create pill in the primary variant', () => {
    const onAskAstra = vi.fn()
    const onAction = vi.fn()
    const tree = render(
      <HabitListEmptyState
        title="Empty"
        description=""
        askAstraLabel="Ask Astra"
        onAskAstra={onAskAstra}
        actionLabel="Create habit"
        onAction={onAction}
      />,
    )
    const texts = textStrings(tree)
    expect(texts).toContain('Ask Astra')
    expect(texts).toContain('Create habit')
  })

  it('renders the create pill without the Astra pill when no Astra handler is given', () => {
    const tree = render(
      <HabitListEmptyState title="Empty" description="" actionLabel="Create habit" />,
    )
    const texts = textStrings(tree)
    expect(texts).toContain('Create habit')
    expect(texts).not.toContain('Ask Astra')
  })

  it('falls back to a single underline link action in the secondary variant', () => {
    const onAction = vi.fn()
    const tree = render(
      <HabitListEmptyState
        variant="secondary"
        title="Empty"
        description=""
        actionLabel="Browse all"
        onAction={onAction}
        askAstraLabel="Ask Astra"
        onAskAstra={vi.fn()}
      />,
    )
    expect(textStrings(tree)).not.toContain('Ask Astra')
    const link = pressableWithLabel(tree, 'Browse all')
    expect(link).toBeTruthy()
    TestRenderer.act(() => {
      ;(link!.props as { onPress: () => void }).onPress()
    })
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders nothing actionable when no labels are provided', () => {
    const tree = render(<HabitListEmptyState title="Empty" description="" />)
    expect(
      tree.root.findAll((node) => node.props?.accessibilityRole === 'button'),
    ).toHaveLength(0)
  })
})

describe('SkeletonCard', () => {
  it('renders its structural skeleton nodes', () => {
    const styles = {
      skeletonCard: {},
      skeletonCircle: {},
      skeletonContent: {},
      skeletonTitle: {},
      skeletonSubtitle: {},
      skeletonCheck: {},
    }
    const tree = render(<SkeletonCard styles={styles} />)
    expect(tree.toJSON()).not.toBeNull()
  })
})

describe('getEmptyHabitsMessage', () => {
  it('resolves a distinct message key per view', () => {
    const translate = (key: string) => key
    const today = getEmptyHabitsMessage('today', translate)
    const all = getEmptyHabitsMessage('all', translate)
    const general = getEmptyHabitsMessage('general', translate)
    expect(today).not.toBe(all)
    expect(all).not.toBe(general)
    expect(today).toBe('habits.noDueToday')
  })
})
