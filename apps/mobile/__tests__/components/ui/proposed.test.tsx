import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ListRow } from '@/components/ui/list-row'
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

function flattenedStyle(node: TestNode): Readonly<Record<string, unknown>> {
  return StyleSheet.flatten(prop(node, 'style'))
}

const compositeLabelStyle = { color: createTokensV2('purple', 'dark').fg3, fontSize: 17 }
const compositeInputStyle = { color: createTokensV2('purple', 'dark').fg1, fontSize: 16 }

function CompositeValue() {
  return (
    <View>
      <Text style={compositeLabelStyle} testID="composite-label">Suggested label</Text>
      <TextInput style={compositeInputStyle} testID="composite-input" value="Suggested input" />
    </View>
  )
}

describe('Proposed on mobile', () => {
  it('renders the labelled dashed treatment at the scope radius', () => {
    const tree = render(
      <Proposed proposed scope="field" label="Proposed by Astra">
        <Text testID="suggested-value">Suggested value</Text>
      </Proposed>,
    )
    const wrapper = tree.root.findByProps({ testID: 'proposed-field' })
    expect(prop(wrapper, 'accessible')).toBe(false)
    expect(prop(tree.root.findByProps({ testID: 'proposed-field-label' }), 'accessibilityLabel')).toBe('Proposed by Astra')
    expect(prop(wrapper, 'style')).toMatchObject({ borderRadius: 12, borderStyle: 'dashed' })
    expect(flattenedStyle(tree.root.findByProps({ testID: 'suggested-value' }))).toMatchObject({ color: createTokensV2('purple', 'dark').fg3 })
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

  it('preserves the explicit token colors rendered by a design-system child', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <ListRow description="Supporting words" readOnly title="Design-system value" value="Daily" />
      </Proposed>,
    )
    const tokens = createTokensV2('purple', 'dark')
    const listRowText = tree.root.findAllByType('Text').filter((node) =>
      ['Design-system value', 'Supporting words', 'Daily'].includes(prop<string>(node, 'children')))

    expect(listRowText.map((node) => prop(node, 'children'))).toEqual([
      'Design-system value',
      'Supporting words',
      'Daily',
    ])
    expect(listRowText.map((node) => flattenedStyle(node).color)).toEqual([
      tokens.fg1,
      tokens.fg3,
      tokens.fg3,
    ])
  })

  it('leaves the explicit token colors owned by a composite child unaltered', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <CompositeValue />
      </Proposed>,
    )

    expect(prop(tree.root.findByProps({ testID: 'composite-label' }), 'style')).toBe(compositeLabelStyle)
    expect(prop(tree.root.findByProps({ testID: 'composite-input' }), 'style')).toBe(compositeInputStyle)
    expect(flattenedStyle(tree.root.findByProps({ testID: 'composite-label' })).color).toBe(compositeLabelStyle.color)
    expect(flattenedStyle(tree.root.findByProps({ testID: 'composite-input' })).color).toBe(compositeInputStyle.color)
  })

  it('tints unstyled nested text and text input through arrays and fragments', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <>
          {[
            <View key="nested">
              <Text style={{ fontSize: 17 }} testID="nested-text">Nested value</Text>
            </View>,
            <TextInput key="input" style={{ fontSize: 16 }} testID="nested-input" value="Nested input" />,
          ]}
        </>
      </Proposed>,
    )
    const proposedColor = createTokensV2('purple', 'dark').fg3

    expect(flattenedStyle(tree.root.findByProps({ testID: 'nested-text' }))).toMatchObject({ color: proposedColor, fontSize: 17 })
    expect(flattenedStyle(tree.root.findByProps({ testID: 'nested-input' }))).toMatchObject({ color: proposedColor, fontSize: 16 })
  })

  it('wraps bare string and number children in fg3 native Text', () => {
    const tree = render(
      <Proposed proposed scope="block" label="Proposed by Astra">
        Bare value
        {42}
      </Proposed>,
    )
    const wrappedValues = tree.root.findAllByType('Text').filter((node) => {
      const value = prop(node, 'children')
      return value === 'Bare value' || value === 42
    })

    expect(wrappedValues.map((node) => prop(node, 'children'))).toEqual(['Bare value', 42])
    expect(wrappedValues.map((node) => flattenedStyle(node).color)).toEqual([
      createTokensV2('purple', 'dark').fg3,
      createTokensV2('purple', 'dark').fg3,
    ])
  })

  it('keeps the hairline and status announcement full-strength', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <Text testID="full-strength-value">Value</Text>
      </Proposed>,
    )
    const wrapperStyle = prop<Record<string, unknown>>(tree.root.findByProps({ testID: 'proposed-row' }), 'style')
    const labelStyle = prop<Record<string, unknown>>(tree.root.findByProps({ testID: 'proposed-row-label' }), 'style')
    const valueStyle = flattenedStyle(tree.root.findByProps({ testID: 'full-strength-value' }))

    expect(wrapperStyle).toMatchObject({ borderStyle: 'dashed', borderWidth: 1 })
    expect(wrapperStyle.opacity).toBeUndefined()
    expect(labelStyle.opacity).toBeUndefined()
    expect(valueStyle.opacity).toBeUndefined()
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
