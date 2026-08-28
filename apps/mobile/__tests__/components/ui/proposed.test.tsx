import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import { Pressable, Text } from 'react-native'
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

function CompositeValue() {
  return <Text testID="composite-value" style={{ color: createTokensV2('purple', 'dark').fg1 }}>Composite value</Text>
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
    expect(prop<Record<string, unknown>>(tree.root.findByProps({ testID: 'proposed-field-content' }), 'style')).toMatchObject({ opacity: 0.63 })
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

  it('dims a composite child without adding per-node tint styles', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <CompositeValue />
      </Proposed>,
    )
    const content = tree.root.findByProps({ testID: 'proposed-row-content' })
    const compositeValue = tree.root.findByProps({ testID: 'composite-value' })

    expect(prop(content, 'style')).toMatchObject({ opacity: 0.63 })
    expect(prop(compositeValue, 'style')).toEqual({ color: createTokensV2('purple', 'dark').fg1 })
  })

  it('wraps bare string and number children in native Text', () => {
    const tree = render(
      <Proposed proposed scope="block" label="Proposed by Astra">
        Bare value
        {42}
      </Proposed>,
    )
    const renderedValues = tree.root
      .findByProps({ testID: 'proposed-block-content' })
      .findAllByType('Text')
      .map((node) => prop(node, 'children'))

    expect(renderedValues).toEqual(['Bare value', 42])
  })

  it('keeps the hairline and status announcement outside the dimmed content', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <Text>Value</Text>
      </Proposed>,
    )
    const wrapperStyle = prop<Record<string, unknown>>(tree.root.findByProps({ testID: 'proposed-row' }), 'style')
    const labelStyle = prop<Record<string, unknown>>(tree.root.findByProps({ testID: 'proposed-row-label' }), 'style')
    const contentStyle = prop<Record<string, unknown>>(tree.root.findByProps({ testID: 'proposed-row-content' }), 'style')

    expect(wrapperStyle).toMatchObject({ borderStyle: 'dashed', borderWidth: 1 })
    expect(wrapperStyle.opacity).toBeUndefined()
    expect(labelStyle.opacity).toBeUndefined()
    expect(contentStyle.opacity).toBe(0.63)
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
