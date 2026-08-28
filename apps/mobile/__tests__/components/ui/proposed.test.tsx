import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import { Text } from 'react-native'
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
    expect(prop(wrapper, 'accessibilityLabel')).toBe('Proposed by Astra')
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

  it('depends only on caller words, not locale defaults', () => {
    const tree = render(
      <Proposed proposed scope="row" label="Suggested">
        <Text>Caller words</Text>
      </Proposed>,
    )
    expect(prop(tree.root.findByProps({ testID: 'proposed-row' }), 'accessibilityLabel')).toBe('Suggested')
    expect(tree.root.findAllByType('Text').map((node) => prop(node, 'children'))).toContain('Caller words')
  })
})
