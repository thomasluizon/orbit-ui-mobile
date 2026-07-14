import React from 'react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { FrequencyTypeCards } from '@/components/habits/habit-form-fields/frequency-type-cards'

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
}
interface TestTree {
  root: TestNode
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

const tokens = createTokensV2()
const styles = createStyles(tokens)

type Handlers = {
  onSetOneTime: Mock<() => void>
  onSetRecurring: Mock<() => void>
  onSetFlexible: Mock<() => void>
  onSetGeneral: Mock<() => void>
}

function renderCards(
  flags: { isOneTime?: boolean; isGeneral?: boolean; isFlexible?: boolean } = {},
) {
  const handlers: Handlers = {
    onSetOneTime: vi.fn<() => void>(),
    onSetRecurring: vi.fn<() => void>(),
    onSetFlexible: vi.fn<() => void>(),
    onSetGeneral: vi.fn<() => void>(),
  }
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <FrequencyTypeCards
        isOneTime={flags.isOneTime ?? false}
        isGeneral={flags.isGeneral ?? false}
        isFlexible={flags.isFlexible ?? false}
        {...handlers}
        styles={styles}
        tokens={tokens}
      />,
    )
  })
  return { tree, handlers }
}

function radioByLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) => node.props?.accessibilityRole === 'radio' && node.props?.accessibilityLabel === label,
  )[0]
}

function arrowByLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) => node.props?.accessibilityRole === 'button' && node.props?.accessibilityLabel === label,
  )[0]
}

function press(node: TestNode) {
  TestRenderer.act(() => {
    ;(node.props as { onPress: () => void }).onPress()
  })
}

describe('FrequencyTypeCards', () => {
  it('marks recurring active by default', () => {
    const { tree } = renderCards()
    expect(
      (radioByLabel(tree, 'habits.form.recurring')!.props.accessibilityState as { checked: boolean })
        .checked,
    ).toBe(true)
  })

  it('marks the one-time card active when isOneTime', () => {
    const { tree } = renderCards({ isOneTime: true })
    expect(
      (radioByLabel(tree, 'habits.form.oneTimeTask')!.props.accessibilityState as { checked: boolean })
        .checked,
    ).toBe(true)
  })

  it('marks the general card active when isGeneral', () => {
    const { tree } = renderCards({ isGeneral: true })
    expect(
      (radioByLabel(tree, 'habits.form.general')!.props.accessibilityState as { checked: boolean })
        .checked,
    ).toBe(true)
  })

  it('invokes the matching handler when a card is pressed', () => {
    const { tree, handlers } = renderCards()
    press(radioByLabel(tree, 'habits.form.flexible')!)
    expect(handlers.onSetFlexible).toHaveBeenCalledTimes(1)
  })

  it('steps to the previous frequency via the left arrow', () => {
    const { tree, handlers } = renderCards()
    const previous = arrowByLabel(tree, 'common.previous')!
    expect(previous.props.disabled).toBe(false)
    press(previous)
    expect(handlers.onSetOneTime).toHaveBeenCalledTimes(1)
  })

  it('steps forward via the right arrow', () => {
    const { tree, handlers } = renderCards()
    press(arrowByLabel(tree, 'common.next')!)
    expect(handlers.onSetFlexible).toHaveBeenCalledTimes(1)
  })

  it('disables the left arrow on the first card', () => {
    const { tree } = renderCards({ isOneTime: true })
    expect(arrowByLabel(tree, 'common.previous')!.props.disabled).toBe(true)
  })

  it('disables the right arrow on the last card', () => {
    const { tree } = renderCards({ isGeneral: true })
    expect(arrowByLabel(tree, 'common.next')!.props.disabled).toBe(true)
  })

  it('ignores an out-of-range step past the first card', () => {
    const { tree, handlers } = renderCards({ isOneTime: true })
    press(arrowByLabel(tree, 'common.previous')!)
    expect(handlers.onSetOneTime).not.toHaveBeenCalled()
    expect(handlers.onSetRecurring).not.toHaveBeenCalled()
  })

  it('ignores an out-of-range step past the last card', () => {
    const { tree, handlers } = renderCards({ isGeneral: true })
    press(arrowByLabel(tree, 'common.next')!)
    expect(handlers.onSetGeneral).not.toHaveBeenCalled()
    expect(handlers.onSetFlexible).not.toHaveBeenCalled()
  })

  it('ignores momentum scroll settling before the page width is measured', () => {
    const { tree, handlers } = renderCards()
    const scroll = tree.root.findAll((node) => node.type === 'ScrollView')[0]!
    TestRenderer.act(() => {
      ;(scroll.props as {
        onMomentumScrollEnd: (event: { nativeEvent: { contentOffset: { x: number } } }) => void
      }).onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 600 } } })
    })
    expect(handlers.onSetFlexible).not.toHaveBeenCalled()
  })
})
