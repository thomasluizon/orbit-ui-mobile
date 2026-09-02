import type { ReactElement } from 'react'
import type { BlockFrameItem, BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text } from 'react-native'
import { BlockFrame } from '@/components/ui/block-frame'

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

afterEach(() => {
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = true
})

describe('BlockFrame on mobile', () => {
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
    expect(prop(root, 'accessibilityState')).toEqual({ busy: true })
    expect(tree.root.findByProps({ testID: 'block-frame-loading-skeleton' })).toBeDefined()
    expect(textValues(tree)).not.toContain('First row')
  })

  it('renders rows in order and derives the count from items', () => {
    const tree = render(<BlockFrame {...frame()} />)
    const texts = textValues(tree)
    expect(texts).toContain(2)
    expect(texts.indexOf('First row')).toBeLessThan(texts.indexOf('Second row'))
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

    expect(prop(tree.root.findByProps({ testID: 'block-frame-partiallyFailed' }), 'accessibilityState')).toEqual({ busy: false })
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

  it('renders risk once and keeps one actions slot outside the scroll body', () => {
    const tree = render(
      <BlockFrame
        {...frame({ risk: <Text testID="risk">High risk</Text>, actions: <Text testID="action">Apply</Text> })}
      />,
    )
    expect(tree.root.findAll((node) => node.type === 'Text' && prop(node, 'testID') === 'risk')).toHaveLength(1)
    expect(tree.root.findAll((node) => node.type === 'Text' && prop(node, 'testID') === 'action')).toHaveLength(1)
    const body = tree.root.find((node) => node.type === 'ScrollView' && prop(node, 'testID') === 'block-frame-body')
    expect(body.findAllByProps({ testID: 'action' })).toHaveLength(0)
    expect(tree.root.find((node) => node.type === 'View' && prop(node, 'testID') === 'block-frame-action-row')).toBeDefined()
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

  it('keeps announcements local and exposes busy state only while working', () => {
    const tree = render(<BlockFrame {...frame()} />)
    expect(prop(tree.root.findByProps({ testID: 'block-frame-body' }), 'accessibilityLiveRegion')).toBe('polite')
    expect(prop(tree.root.findByProps({ testID: 'block-frame-resting' }), 'accessibilityState')).toEqual({ busy: false })

    void act(() => {
      tree.update(<BlockFrame {...frame({ state: 'acting' })} />)
    })
    expect(prop(tree.root.findByProps({ testID: 'block-frame-acting' }), 'accessibilityState')).toEqual({ busy: true })
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
