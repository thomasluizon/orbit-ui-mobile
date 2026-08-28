import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import { Proposed } from '@/components/ui/proposed'
import { createTokensV2 } from '@/lib/theme'

interface TestNode {
  readonly props: Readonly<Record<string, unknown>>
  findByProps(props: Readonly<Record<string, unknown>>): TestNode
  findAllByProps(props: Readonly<Record<string, unknown>>): TestNode[]
  findAllByType(type: string): TestNode[]
}

interface TestTree {
  readonly root: TestNode
}

function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  void act(() => {
    tree = create(element) as unknown as TestTree
  })
  if (tree == null) throw new Error('Proposed test renderer did not mount')
  return tree
}

function prop<T>(node: TestNode, name: string): T {
  return node.props[name] as T
}

describe('Proposed on mobile', () => {
  it('renders the labelled dashed treatment at the scope radius', () => {
    const tree = render(
      <Proposed proposed scope="field" label="Proposed by Astra">
        <Text>Suggested value</Text>
      </Proposed>,
    )
    const wrapper = tree.root.findByProps({ testID: 'proposed-field' })
    expect(prop(wrapper, 'accessible')).toBe(false)
    expect(prop(tree.root.findByProps({ testID: 'proposed-field-label' }), 'accessibilityLabel')).toBe('Proposed by Astra')
    expect(prop(wrapper, 'style')).toMatchObject({ borderRadius: 12, borderStyle: 'dashed' })
    const text = tree.root.findAllByType('Text').at(-1)!
    expect(prop<unknown[]>(text, 'style')).toContainEqual({ color: createTokensV2('purple', 'dark').fg3 })
  })

  it('returns the child untouched when the state is off', () => {
    const tree = render(
      <Proposed proposed={false} scope="block" label="Proposed by Astra">
        <Text testID="child">Value</Text>
      </Proposed>,
    )
    expect(tree.root.findByProps({ testID: 'child' })).toBeDefined()
    expect(tree.root.findAllByProps({ testID: 'proposed-block' })).toHaveLength(0)
    expect(prop(tree.root.findByProps({ testID: 'child' }), 'style')).toBeUndefined()
  })

  it('tints nested text and every text node across multiple children', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <View><Text testID="nested-value">Nested value</Text></View>
        <Text testID="second-value">Second value</Text>
      </Proposed>,
    )
    const proposedColor = { color: createTokensV2('purple', 'dark').fg3 }

    expect(prop<unknown[]>(tree.root.findByProps({ testID: 'nested-value' }), 'style')).toContainEqual(proposedColor)
    expect(prop<unknown[]>(tree.root.findByProps({ testID: 'second-value' }), 'style')).toContainEqual(proposedColor)
  })

  it('announces the treatment separately from interactive descendants', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <Pressable accessibilityLabel="Row control" accessibilityRole="button" onPress={() => undefined}>
          <Text>Control</Text>
        </Pressable>
        <Pressable accessibilityLabel="Edit row" accessibilityRole="button" onPress={() => undefined}>
          <Text>Edit</Text>
        </Pressable>
      </Proposed>,
    )

    expect(prop(tree.root.findByProps({ testID: 'proposed-row' }), 'accessible')).toBe(false)
    expect(prop(tree.root.findByProps({ testID: 'proposed-row-label' }), 'accessibilityLabel')).toBe('Proposed by Astra')
    expect(tree.root.findByProps({ accessibilityLabel: 'Row control' })).toBeDefined()
    expect(tree.root.findByProps({ accessibilityLabel: 'Edit row' })).toBeDefined()
  })

  it('depends only on caller words, not locale defaults', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Suggested">
        <Text testID="caller-words">Caller words</Text>
      </Proposed>,
    )
    expect(prop(tree.root.findByProps({ testID: 'proposed-row-label' }), 'accessibilityLabel')).toBe('Suggested')
    expect(tree.root.findByProps({ testID: 'caller-words' })).toBeDefined()
  })
})
