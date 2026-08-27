import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Columns } from '@/components/ui/columns'
import { Fab } from '@/components/ui/fab'
import { Icon } from '@/components/ui/icon'
import { Lockup } from '@/components/ui/lockup'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { ProgressRing } from '@/components/ui/progress-ring'
import { createTokensV2 } from '@/lib/theme'

const tokens = createTokensV2('purple', 'dark')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  find(predicate: (node: TestNode) => boolean): TestNode
  findByProps(props: Readonly<Record<string, unknown>>): TestNode
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findAllByType(type: string): TestNode[]
}

interface TestTree {
  readonly root: TestNode
  update(element: ReactElement): void
}

type StyleArray = readonly [Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>]

function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  void act(() => {
    tree = create(element) as unknown as TestTree
  })
  if (tree == null) throw new Error('Primitive test renderer did not mount')
  return tree
}

function prop<T>(node: TestNode, name: string): T {
  return node.props[name] as T
}

function byType(root: TestNode, type: string): TestNode[] {
  return root.findAll((node) => node.type === type)
}

describe('redesign primitives on mobile', () => {
  it('renders a measured zero as a 2px column without using the empty words', () => {
    const tree = render(
      <Columns
        columns={[
          { id: 'zero', label: 'Zero', value: 0 },
          { id: 'ten', label: 'Ten', value: 10 },
        ]}
        label="Results"
        emptyLabel="No measurements"
      />,
    )
    expect(prop(tree.root.findAllByType('View')[0]!, 'accessible')).toBe(false)
    const zero = tree.root.find((node) => prop(node, 'accessibilityLabel') === 'Results. Zero: 0')
    expect(prop(zero, 'accessibilityRole')).toBe('image')
    const fill = zero.findAllByType('View').find((node) => {
      const style = prop<StyleArray | undefined>(node, 'style')
      return style?.[1]?.height === 2
    })
    expect(prop<StyleArray>(fill!, 'style')[1].height).toBe(2)
  })

  it('uses the tallest column or a supplied shared maximum as its scale', () => {
    const tree = render(
      <Columns columns={[{ id: 'one', label: 'One', value: 10 }]} emptyLabel="Empty" />,
    )
    const findFill = () => tree.root.findAllByType('View').find((node) => {
      const style = prop<StyleArray | undefined>(node, 'style')
      return style?.[0]?.maxWidth === 48
    })
    expect(prop<StyleArray>(findFill()!, 'style')[1].height).toBe('100%')

    void act(() => {
      tree.update(
        <Columns columns={[{ id: 'one', label: 'One', value: 10 }]} max={20} emptyLabel="Empty" />,
      )
    })
    expect(prop<StyleArray>(findFill()!, 'style')[1].height).toBe('50%')
  })

  it('draws unfinished ring progress in accent and completion in neutral', () => {
    const tree = render(<ProgressRing value={40} label="Progress" />)
    expect(prop(byType(tree.root, 'Circle')[1]!, 'stroke')).toBe(tokens.primary)

    void act(() => {
      tree.update(<ProgressRing value={100} label="Progress" />)
    })
    expect(tree.root.findByProps({ testID: 'progress-ring-complete' })).toBeDefined()
    expect(prop(byType(tree.root, 'Circle')[1]!, 'stroke')).toBe(tokens.fg3)
  })

  it('keeps the FAB labelled and actionable', () => {
    const onClick = vi.fn()
    const tree = render(<Fab label="Create" onClick={onClick}>+</Fab>)
    const button = tree.root.findByProps({ testID: 'fab' })
    expect(prop(button, 'accessibilityLabel')).toBe('Create')
    prop<() => void>(button, 'onPress')()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('selects native brand redraws and limits the mark accent to its moon', () => {
    const tree = render(<OrbitMark size={16} />)
    expect(tree.root.findByProps({ testID: 'orbit-mark-16' })).toBeDefined()
    expect(prop(byType(tree.root, 'Path').at(-1)!, 'fill')).toBe('currentColor')

    void act(() => {
      tree.update(<OrbitMark size={24} accent />)
    })
    expect(tree.root.findByProps({ testID: 'orbit-mark-accent' })).toBeDefined()
    const paths = byType(tree.root, 'Path')
    expect(prop(paths[0]!, 'fill')).toBe('currentColor')
    expect(prop(paths.at(-1)!, 'fill')).toBe(tokens.primary)
  })

  it('uses the Astra native redraw and honours a color override', () => {
    const tree = render(<AstraGlyph size={16} />)
    expect(tree.root.findByProps({ testID: 'astra-mark-16' })).toBeDefined()

    void act(() => {
      tree.update(<AstraGlyph size={24} color="#123456" />)
    })
    expect(prop(tree.root.findByProps({ testID: 'astra-mark' }), 'color')).toBe('#123456')
  })

  it('centres icons at the default size and makes accessibility deliberate', () => {
    const tree = render(<Icon name="home" />)
    const decorative = tree.root.findByProps({ testID: 'icon-home' })
    expect(prop(decorative, 'accessibilityElementsHidden')).toBe(true)
    expect(prop(decorative, 'style')).toMatchObject({ height: 24, width: 24 })

    void act(() => {
      tree.update(<Icon name="home" label="Home" />)
    })
    expect(prop(tree.root.findByProps({ testID: 'icon-home' }), 'accessibilityLabel')).toBe('Home')
  })

  it('renders the outlined lockup with fixed geometry and no text node', () => {
    const tree = render(<Lockup />)
    const lockup = tree.root.findByProps({ testID: 'orbit-lockup' })
    expect(prop(lockup, 'viewBox')).toBe('-0.000000087 0 89.395502773 17.882739221')
    expect(byType(tree.root, 'Path')).toHaveLength(3)
    expect(byType(tree.root, 'Text')).toHaveLength(0)
  })
})
