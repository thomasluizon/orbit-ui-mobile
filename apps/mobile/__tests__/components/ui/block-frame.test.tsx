import type { ReactElement } from 'react'
import type { BlockFrameItem, BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as ReactNative from 'react-native'
import { AccessibilityInfo, Pressable, StyleSheet, Text, type ViewStyle, type TextStyle } from 'react-native'
import { BlockFrame } from '@/components/ui/block-frame'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { Button } from '@/components/ui/pill-button'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'blockFrame.status.done': 'Done',
      'blockFrame.status.acting': 'In progress',
      'blockFrame.status.failed': 'Failed',
      'blockFrame.refresh': 'Refresh',
    })[key] ?? key,
    i18n: { language: 'en' },
  }),
}))

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  find(predicate: (node: TestNode) => boolean): TestNode
  findByProps(props: Readonly<Record<string, unknown>>): TestNode
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findAllByProps(props: Readonly<Record<string, unknown>>): TestNode[]
  findAllByType(type: string): TestNode[]
}

interface TestTree {
  readonly root: TestNode
  update(element: ReactElement): void
  toJSON(): ReactTestRendererJSON
  unmount(): void
}

const items: readonly BlockFrameItem[] = [
  { id: 'one', label: 'First row' },
  { id: 'two', label: 'Second row', meta: 'Second detail' },
]

function frame(overrides: Partial<BlockFrameProps> = {}): BlockFrameProps {
  return { state: 'resting', title: 'Changes', items, ...overrides } as BlockFrameProps
}

function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  void act(() => {
    tree = create(element) as unknown as TestTree
  })
  if (tree == null) throw new Error('Block frame test renderer did not mount')
  return tree
}

function prop<T>(node: TestNode, name: string): T {
  return node.props[name] as T
}

function textValues(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => prop(node, 'children'))
}

type LayoutStyle = ViewStyle & TextStyle

function applyActionStyle(node: YogaNode, style: LayoutStyle) {
  node.setFlex(style.flex)
  node.setWidth(style.width as number | `${number}%` | undefined)
  node.setMaxWidth(style.maxWidth as number | `${number}%` | undefined)
  node.setHeight(style.height as number | `${number}%` | undefined)
  node.setMinWidth(typeof style.minWidth === 'number' ? style.minWidth : undefined)
  node.setMinHeight(typeof style.minHeight === 'number' ? style.minHeight : undefined)
  node.setGap(Yoga.GUTTER_ALL, style.gap as number | undefined)
  node.setPadding(Yoga.EDGE_ALL, style.padding as number | undefined)
  node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal as number | undefined)
  node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical as number | undefined)
  node.setPadding(Yoga.EDGE_START, style.paddingStart as number | undefined)
  node.setMargin(Yoga.EDGE_ALL, style.margin as number | undefined)
  node.setMargin(Yoga.EDGE_VERTICAL, style.marginVertical as number | undefined)
  node.setBorder(Yoga.EDGE_ALL, style.borderWidth)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.justifyContent === 'flex-end') node.setJustifyContent(Yoga.JUSTIFY_FLEX_END)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignItems === 'flex-start') node.setAlignItems(Yoga.ALIGN_FLEX_START)
}

function buildActionLayout(host: ReactTestRendererJSON, nodes: Map<string, YogaNode>, config: ReturnType<typeof Yoga.Config.create>): YogaNode {
  const node = Yoga.Node.create(config)
  const renderedStyle = typeof host.props.style === 'function' ? host.props.style({ pressed: false }) : host.props.style
  const style = (StyleSheet.flatten(renderedStyle) ?? {}) as LayoutStyle
  applyActionStyle(node, style)
  if (typeof host.props.testID === 'string') nodes.set(host.props.testID, node)
  if (host.type === 'Text') {
    const label = (Array.isArray(host.children) ? host.children : []).filter(child => typeof child === 'string').join('')
    node.setMeasureFunc(() => ({ width: label.length * (style.fontSize ?? 14) / 2, height: style.lineHeight ?? 20 }))
  } else {
    for (const child of Array.isArray(host.children) ? host.children : []) {
      if (typeof child !== 'string') node.insertChild(buildActionLayout(child, nodes, config), node.getChildCount())
    }
  }
  return node
}

function absoluteLeft(node: YogaNode): number {
  const parent = node.getParent()
  return node.getComputedLeft() + (parent ? absoluteLeft(parent) : 0)
}

afterEach(() => {
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = true
})

describe('BlockFrame on mobile', () => {
  it('keeps typed labels beside their trailing actions and aligns growing rows to the first line', () => {
    const name = 'Read the books I chose to learn about all the places and people around the world before breakfast every morning'
    const tree = render(<BlockFrame {...frame({ items: [{
      id: 'typed', wrapLabel: true, wrapMeta: true,
      label: <PersonalTextDetails>{name}</PersonalTextDetails>,
      meta: 'Every day', control: <Pressable accessibilityLabel="Remove item"><Text>Remove</Text></Pressable>,
    }] })} />)
    const row = tree.root.find((node) => node.type === 'View' && prop(node, 'testID') === 'block-frame-item-typed-pending')
    const style = StyleSheet.flatten(prop<ViewStyle>(row, 'style'))
    expect(style.flexDirection).toBe('row')
    expect(style.alignItems).toBe('flex-start')
    expect(row.findByProps({ accessibilityLabel: name })).toBeDefined()
    expect(row.findByProps({ accessibilityLabel: 'Remove item' })).toBeDefined()
    void act(() => tree.unmount())
  })

  it('moves accessibility focus to a preview heading after layout', () => {
    const findNode = vi.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(42)
    const focus = vi.fn()
    const originalFocus = Object.getOwnPropertyDescriptor(AccessibilityInfo, 'setAccessibilityFocus')
    Object.defineProperty(AccessibilityInfo, 'setAccessibilityFocus', { configurable: true, value: focus })
    const tree = render(<BlockFrame {...frame({ focusTitleOnMount: true })} />)
    const title = tree.root.find((node) => node.type === 'Text' && prop(node, 'children') === 'Changes')
    prop<() => void>(title, 'onLayout')()
    prop<() => void>(title, 'onLayout')()
    expect(findNode).toHaveBeenCalled()
    expect(focus).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledWith(42)
    findNode.mockRestore()
    if (originalFocus) Object.defineProperty(AccessibilityInfo, 'setAccessibilityFocus', originalFocus)
    else Reflect.deleteProperty(AccessibilityInfo, 'setAccessibilityFocus')
  })

  it('renders a body without a zero count when there are no rows', () => {
    const tree = render(<BlockFrame {...frame({ items: [], body: <Text>Nothing logged</Text> })} />)
    expect(textValues(tree)).toContain('Nothing logged')
    expect(textValues(tree)).not.toContain(0)
  })

  it('renders an interactive row label outside a native Text container', () => {
    const onPress = vi.fn()
    const tree = render(<BlockFrame {...frame({ items: [{
      id: 'interactive',
      label: <Pressable accessibilityLabel="Open habit" onPress={onPress}><Text>Water</Text></Pressable>,
    }] })} />)

    const label = tree.root.findByProps({ accessibilityLabel: 'Open habit' })
    prop<() => void>(label, 'onPress')()
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('renders a busy loading skeleton without row labels', () => {
    const tree = render(<BlockFrame {...frame({ state: 'loading', actions: <Text>Save</Text> })} />)
    const root = tree.root.findByProps({ testID: 'block-frame-loading' })
    expect(prop(root, 'accessibilityState')).toBeUndefined()
    expect(tree.root.findByProps({ testID: 'block-frame-loading-skeleton' })).toBeDefined()
    expect(textValues(tree)).not.toContain('First row')
  })

  it('renders rows in order and derives the count from items', () => {
    const tree = render(<BlockFrame {...frame()} />)
    const texts = textValues(tree)
    expect(texts).toContain(2)
    expect(texts.indexOf('First row')).toBeLessThan(texts.indexOf('Second row'))
  })

  it('wraps row metadata only when wrapMeta is set', () => {
    const tree = render(<BlockFrame {...frame({ items: [
      { id: 'wrapped', label: 'Wrapped', meta: 'Long preview summary', wrapMeta: true },
      { id: 'single', label: 'Single', meta: 'Short summary', wrapLabel: true },
    ] })} />)
    const wrapped = tree.root.find((node) => node.type === 'Text' && prop(node, 'children') === 'Long preview summary')
    const single = tree.root.find((node) => node.type === 'Text' && prop(node, 'children') === 'Short summary')
    expect(prop(wrapped, 'numberOfLines')).toBeUndefined()
    expect(prop(single, 'numberOfLines')).toBe(1)
  })

  it('refreshes a stale frame once and withholds old actions', () => {
    const onRefresh = vi.fn()
    const tree = render(
      <BlockFrame
        state="stale"
        title="Changes"
        items={items}
        staleMessage="The source moved"
        onRefresh={onRefresh}
        actions={<Text testID="old-action">Old action</Text>}
      />,
    )
    const refresh = tree.root.findByProps({ accessibilityLabel: 'Refresh' })
    prop<() => void>(refresh, 'onPress')()
    expect(textValues(tree)).toContain('The source moved')
    expect(tree.root.findAllByProps({ testID: 'old-action' })).toHaveLength(0)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('keeps pending rows editable and status rows fixed', () => {
    const onEditItem = vi.fn()
    const tree = render(
      <BlockFrame
        {...frame({
          items: [items[0]!, { id: 'done', label: 'Finished', status: 'done' }],
          onEditItem,
          editLabel: 'Edit item',
        })}
      />,
    )
    expect(tree.root.findByProps({ testID: 'block-frame-item-done-done' })).toBeDefined()
    const editButtons = tree.root.findAll((node) =>
      node.type === 'Pressable' && prop(node, 'accessibilityLabel') === 'Edit item')
    expect(editButtons).toHaveLength(1)
    prop<() => void>(editButtons[0]!, 'onPress')()
    expect(onEditItem).toHaveBeenCalledWith('one')
  })

  it('uses default and overridden status labels and renders a row control', () => {
    const tree = render(
      <BlockFrame
        {...frame({
          items: [{ id: 'done', label: 'Finished', status: 'done', control: <Text testID="control">Control</Text> }],
        })}
      />,
    )
    expect(textValues(tree)).toEqual(expect.arrayContaining(['Control', 'Done']))

    void act(() => {
      tree.update(
        <BlockFrame {...frame({ items: [{ id: 'done', label: 'Finished', status: 'done', statusLabel: 'Saved' }] })} />,
      )
    })
    expect(textValues(tree)).toContain('Saved')
    expect(textValues(tree)).not.toContain('Done')
  })

  it('retains per-item outcomes and the retry-failures action when partially failed', () => {
    const tree = render(
      <BlockFrame
        {...frame({
          state: 'partiallyFailed',
          items: [
            { id: 'done', label: 'Saved row', status: 'done' },
            { id: 'failed', label: 'Failed row', status: 'failed' },
          ],
          actions: <Pressable accessibilityLabel="Retry failures"><Text>Retry failures</Text></Pressable>,
        })}
      />,
    )

    expect(prop(tree.root.findByProps({ testID: 'block-frame-partiallyFailed' }), 'accessibilityState')).toBeUndefined()
    expect(tree.root.findByProps({ testID: 'block-frame-item-done-done' })).toBeDefined()
    expect(tree.root.findByProps({ testID: 'block-frame-item-failed-failed' })).toBeDefined()
    expect(tree.root.findAll((node) =>
      node.type === 'Pressable' && prop(node, 'accessibilityLabel') === 'Retry failures')).toHaveLength(1)
  })

  it('delegates only suggested rows to Proposed', () => {
    const tree = render(
      <BlockFrame
        {...frame({
          items: [
            { id: 'plain', label: 'Plain' },
            { id: 'suggested', label: 'Suggested', proposed: true },
          ],
          proposedLabel: 'Proposed by Astra',
        })}
      />,
    )
    const wrappers = tree.root.findAll((node) =>
      node.type === 'View' && prop(node, 'testID') === 'proposed-row')
    expect(wrappers).toHaveLength(1)
    expect(prop(wrappers[0]!, 'accessible')).toBe(false)
    expect(prop(tree.root.findByProps({ testID: 'proposed-row-label' }), 'accessibilityLabel')).toBe('Proposed by Astra')
  })

  it('keeps a proposed row control and edit action independently operable', () => {
    const onControl = vi.fn()
    const onEditItem = vi.fn()
    const tree = render(
      <BlockFrame
        {...frame({
          items: [{
            id: 'suggested',
            label: 'Suggested',
            proposed: true,
            control: (
              <Pressable accessibilityLabel="Row control" accessibilityRole="button" onPress={onControl}>
                <Text>Control</Text>
              </Pressable>
            ),
          }],
          proposedLabel: 'Proposed by Astra',
          onEditItem,
          editLabel: 'Edit item',
        })}
      />,
    )

    const wrapper = tree.root.findByProps({ testID: 'proposed-row' })
    const control = tree.root.findByProps({ accessibilityLabel: 'Row control' })
    const edit = tree.root.findByProps({ accessibilityLabel: 'Edit item' })
    expect(prop(wrapper, 'accessible')).toBe(false)
    prop<() => void>(control, 'onPress')()
    prop<() => void>(edit, 'onPress')()
    expect(onControl).toHaveBeenCalledOnce()
    expect(onEditItem).toHaveBeenCalledWith('suggested')
  })

  it('shows confirmation once based on reversibility, never item count', () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ id: String(index), label: `Row ${index}` }))
    const labels = { irreversibleLabel: 'Permanent', confirmNote: 'Confirm this consequence' }
    const tree = render(<BlockFrame {...frame({ items: ten, ...labels })} />)
    expect(textValues(tree)).not.toContain(labels.confirmNote)

    void act(() => {
      tree.update(<BlockFrame {...frame({ items: ten.map((item, index) => index === 4 ? { ...item, irreversible: true } : item), ...labels })} />)
    })
    expect(textValues(tree).filter((value) => value === labels.confirmNote)).toHaveLength(1)

    void act(() => {
      tree.update(<BlockFrame {...frame({ items: [{ id: 'one', label: 'One', irreversible: true }], ...labels })} />)
    })
    expect(textValues(tree).filter((value) => value === labels.confirmNote)).toHaveLength(1)
  })

  it('keeps one actions slot outside the scroll body', () => {
    const tree = render(
      <BlockFrame
        {...frame({ actions: <Text testID="action">Apply</Text> })}
      />,
    )
    expect(tree.root.findAll((node) => node.type === 'Text' && prop(node, 'testID') === 'action')).toHaveLength(1)
    const body = tree.root.find((node) => node.type === 'ScrollView' && prop(node, 'testID') === 'block-frame-body')
    expect(body.findAllByProps({ testID: 'action' })).toHaveLength(0)
    expect(tree.root.find((node) => node.type === 'View' && prop(node, 'testID') === 'action-row')).toBeDefined()
  })

  it.each([412, 1280])('hugs a lone pill at the trailing content edge at %i', (width) => {
    const tree = render(<BlockFrame {...frame({ actions: <Button variant="ghost" size="md" onClick={vi.fn()}>Abrir Perfil</Button> })} />)
    const config = Yoga.Config.create()
    config.setPointScaleFactor(0)
    const nodes = new Map<string, YogaNode>()
    const layout = buildActionLayout(tree.toJSON(), nodes, config)
    try {
      layout.calculateLayout(width, undefined)
      const pill = nodes.get('button-ghost-sm') ?? nodes.get('button-ghost-md')!
      const contentEnd = width - layout.getComputedPadding(Yoga.EDGE_RIGHT) - layout.getComputedBorder(Yoga.EDGE_RIGHT)
      expect(pill.getComputedWidth()).toBeLessThan(width - 50)
      expect(absoluteLeft(pill) + pill.getComputedWidth()).toBeCloseTo(contentEnd, 1)
      expect(nodes.has('action-row')).toBe(true)
      expect(nodes.has('button-ghost-sm')).toBe(true)
      const row = nodes.get('action-row')!
      const guard = row.getParent()!
      const footer = guard.getParent()!
      for (const parent of [guard, footer]) {
        expect(absoluteLeft(pill) + pill.getComputedWidth() + 2).toBeLessThanOrEqual(absoluteLeft(parent) + parent.getComputedWidth())
        expect(parent.getComputedHeight()).toBeGreaterThanOrEqual(pill.getComputedHeight() + 4)
      }
    } finally {
      layout.freeRecursive()
      config.free()
      void act(() => tree.unmount())
    }
  })

  it.each([200, 412])('keeps paired pills 12 apart with trailing wrapped lines at %i', (width) => {
    const tree = render(<BlockFrame {...frame({ actions: <><Button variant="ghost" onClick={vi.fn()}>Reject</Button><Button onClick={vi.fn()}>Approve</Button></> })} />)
    const config = Yoga.Config.create()
    config.setPointScaleFactor(0)
    const nodes = new Map<string, YogaNode>()
    const layout = buildActionLayout(tree.toJSON(), nodes, config)
    try {
      layout.calculateLayout(width, undefined)
      const first = nodes.get('button-ghost-sm')!
      const last = nodes.get('button-primary-sm')!
      const contentEnd = width - layout.getComputedPadding(Yoga.EDGE_RIGHT) - layout.getComputedBorder(Yoga.EDGE_RIGHT)
      expect(absoluteLeft(last) + last.getComputedWidth()).toBeCloseTo(contentEnd, 1)
      if (width === 412) {
        expect(first.getComputedTop()).toBeCloseTo(last.getComputedTop(), 1)
        expect(absoluteLeft(last) - absoluteLeft(first) - first.getComputedWidth()).toBeCloseTo(12, 1)
      } else {
        expect(last.getComputedTop()).toBeGreaterThan(first.getComputedTop())
        expect(absoluteLeft(first) + first.getComputedWidth()).toBeCloseTo(contentEnd, 1)
      }
    } finally {
      layout.freeRecursive()
      config.free()
      void act(() => tree.unmount())
    }
  })

  it('throws every missing runtime label in development', () => {
    expect(() => render(
      <BlockFrame
        {...frame({ items: [{ id: 'unsafe', label: 'Unsafe', irreversible: true, proposed: true }] })}
      />,
    )).toThrow('irreversibleLabel, confirmNote, proposedLabel')
  })

  it('renders rows but withholds actions for missing labels in production', () => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    const tree = render(
      <BlockFrame
        {...frame({
          items: [{ id: 'unsafe', label: 'Unsafe', irreversible: true }],
          actions: <Text testID="action">Apply</Text>,
        })}
      />,
    )
    expect(textValues(tree)).toContain('Unsafe')
    expect(tree.root.findAllByProps({ testID: 'action' })).toHaveLength(0)
  })

  it('keeps announcements local without owning list busy state', () => {
    const tree = render(<BlockFrame {...frame()} />)
    expect(prop(tree.root.findByProps({ testID: 'block-frame-body' }), 'accessibilityLiveRegion')).toBe('polite')
    expect(prop(tree.root.findByProps({ testID: 'block-frame-resting' }), 'accessibilityState')).toBeUndefined()

    void act(() => {
      tree.update(<BlockFrame {...frame({ state: 'acting' })} />)
    })
    expect(prop(tree.root.findByProps({ testID: 'block-frame-acting' }), 'accessibilityState')).toBeUndefined()
    expect(textValues(tree).filter((value) => value === 'In progress')).toHaveLength(items.length)
  })

  it('removes acting actions from touch and TalkBack navigation', () => {
    const tree = render(
      <BlockFrame
        {...frame({
          state: 'acting',
          actions: (
            <Pressable accessibilityLabel="Apply changes" accessibilityRole="button" onPress={() => undefined}>
              <Text>Apply</Text>
            </Pressable>
          ),
        })}
      />,
    )
    expect(tree.root.findByProps({ accessibilityLabel: 'Apply changes' })).toBeDefined()
    const actionContent = tree.root.find((node) => prop(node, 'pointerEvents') === 'none')

    expect(prop(actionContent, 'accessibilityState')).toEqual({ disabled: true })
    expect(prop(actionContent, 'importantForAccessibility')).toBe('no-hide-descendants')
  })
})
