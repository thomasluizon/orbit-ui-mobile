import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as ReactNative from 'react-native'
import { State } from 'react-native-gesture-handler'
import type { DraggableFlatListProps } from 'react-native-draggable-flatlist'
import { createListCellMotion } from '@/lib/list-motion'
const { default: DraggableFlatList } = await vi.importActual<{ default: typeof import('react-native-draggable-flatlist').default }>('react-native-draggable-flatlist/src/components/DraggableFlatList')
const { NestableDraggableFlatList } = await vi.importActual<Pick<typeof import('react-native-draggable-flatlist'), 'NestableDraggableFlatList'>>('react-native-draggable-flatlist/src/components/NestableDraggableFlatList')
const { NestableScrollContainer } = await vi.importActual<Pick<typeof import('react-native-draggable-flatlist'), 'NestableScrollContainer'>>('react-native-draggable-flatlist/src/components/NestableScrollContainer')
type AnimatedValues = Parameters<NonNullable<DraggableFlatListProps<string>['onAnimValInit']>>[0]
type PanEvent = { state: number; translationX: number; translationY: number }
const nativeRuntime = vi.hoisted(() => ({
  endPan: (_event: PanEvent) => {},
  springs: [] as { target: number; configuration: unknown }[],
}))

vi.mock('react-native', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/test-mocks/react-native')>(),
  InteractionManager: undefined,
  LogBox: { ignoreLogs: vi.fn() },
}))

vi.mock('react-native-reanimated', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/test-mocks/react-native-reanimated')>(),
  useAnimatedReaction: () => {},
  useSharedValue: <Value,>(initial: Value) => React.useState(() => ({ value: initial }))[0],
  useDerivedValue: <Value,>(updater: () => Value) => {
    const read = React.useRef(updater)
    React.useLayoutEffect(() => { read.current = updater })
    return React.useState(() => ({ get value() { return read.current() } }))[0]
  },
  runOnUI: <Args extends unknown[],>(callback: (...args: Args) => void) => callback,
  withSpring: (target: number, configuration: unknown, finish?: () => void) => {
    nativeRuntime.springs.push({ target, configuration })
    finish?.()
    return target
  },
}))

vi.mock('react-native-gesture-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/test-mocks/react-native-gesture-handler')>()
  const pan = () => {
    const gesture = {
      onBegin: () => gesture,
      onUpdate: () => gesture,
      onEnd: (callback: (event: PanEvent) => void) => { nativeRuntime.endPan = callback; return gesture },
      onTouchesDown: () => gesture,
      onTouchesUp: () => gesture,
      activeOffsetX: () => gesture,
      activeOffsetY: () => gesture,
      hitSlop: () => gesture,
    }
    return gesture
  }
  function FlatList(props: ReactNative.FlatListProps<string>) {
    return <ReactNative.FlatList {...props}>{Array.from(props.data ?? []).map((item, index) => <React.Fragment key={props.keyExtractor?.(item, index)}>
      {props.renderItem?.({ item, index, separators: { highlight() {}, unhighlight() {}, updateProps() {} } })}
    </React.Fragment>)}</ReactNative.FlatList>
  }
  return { ...actual, FlatList, ScrollView: ReactNative.ScrollView, Gesture: { ...actual.Gesture, Pan: pan } }
})

let tree: ReturnType<typeof TestRenderer.create> | undefined
const idleCallbacks: (() => void)[] = []
beforeEach(() => {
  renderError.mockClear()
  idleCallbacks.length = 0
  nativeRuntime.springs.length = 0
  vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => idleCallbacks.push(callback)))
})
afterEach(async () => { await act(() => tree?.unmount()); vi.unstubAllGlobals() })

const renderError = vi.fn()
class RenderBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { renderError(error) }
  render() { return this.state.failed ? null : this.props.children }
}

it('resets the real list when item keys change without a core InteractionManager export', async () => {
  expect(Reflect.get(ReactNative, 'InteractionManager')).toBeUndefined()
  let animatedValues!: AnimatedValues
  const list = (ids: string[]) => <RenderBoundary><DraggableFlatList data={ids} keyExtractor={(id) => id} renderItem={() => null}
    onAnimValInit={(values) => { animatedValues = values }} /></RenderBoundary>
  await act(() => { tree = TestRenderer.create(list(['first', 'second'])) })
  animatedValues.activeIndexAnim.value = 1
  animatedValues.spacerIndexAnim.value = 1
  animatedValues.touchTranslate.value = 50
  await act(() => { tree!.update(list(['first', 'second', 'created'])) })
  expect(renderError).not.toHaveBeenCalled()
  expect(idleCallbacks).toHaveLength(1)
  expect(animatedValues.activeIndexAnim.value).toBe(1)
  await act(() => { idleCallbacks.shift()!() })
  expect(animatedValues.activeIndexAnim.value).toBe(-1)
  expect(animatedValues.spacerIndexAnim.value).toBe(-1)
  expect(animatedValues.touchTranslate.value).toBe(0)
  expect(tree!.root.findAllByType(ReactNative.FlatList)[0]!.props.data).toEqual(['first', 'second', 'created'])
})

function ListFixture({ nested, ids, onValues, onDrop, reduced = false }: Readonly<{
  nested: boolean; ids: string[]; reduced?: boolean
  onValues: (values: AnimatedValues) => void
  onDrop?: DraggableFlatListProps<string>['onDragEnd']
}>) {
  const props: DraggableFlatListProps<string> = {
    ...createListCellMotion(reduced), data: ids, keyExtractor: (id) => id,
    onAnimValInit: onValues, onDragEnd: onDrop,
    renderItem: ({ item, drag, isActive }) => <ReactNative.Pressable testID={item} onLongPress={drag} accessibilityState={{ selected: isActive }} />,
  }
  return nested ? <NestableScrollContainer><NestableDraggableFlatList {...props} /></NestableScrollContainer> : <DraggableFlatList {...props} />
}

function pressRow(index: number) {
  const onLongPress = tree!.root.findAllByType(ReactNative.Pressable)[index]!.props.onLongPress as () => void
  onLongPress()
}

function selectedRows() {
  return tree!.root.findAllByType(ReactNative.Pressable).map((row) => row.props.accessibilityState as { selected: boolean })
}

it.each([false, true])('resets creation, completion, deletion, day replacement and reordering (nested: %s)', async (nested) => {
  let animatedValues!: AnimatedValues
  const list = (ids: string[]) => <ListFixture nested={nested} ids={ids} onValues={(values) => { animatedValues = values }} />
  await act(() => { tree = TestRenderer.create(list(['first', 'second'])) })
  for (const ids of [['first', 'second', 'created'], ['first', 'created'], ['first'], ['next-day', 'another'], ['another', 'next-day']]) {
    await act(() => { pressRow(0) })
    expect(animatedValues.activeIndexAnim.value).toBe(0)
    await act(() => { tree!.update(list(ids)) })
    expect(idleCallbacks).toHaveLength(1)
    await act(() => { idleCallbacks.shift()!() })
    expect(animatedValues.activeIndexAnim.value).toBe(-1)
    expect(animatedValues.spacerIndexAnim.value).toBe(-1)
    expect(animatedValues.activeCellSize.value).toBe(-1)
    expect(animatedValues.activeCellOffset.value).toBe(-1)
    expect(selectedRows().every((state) => state.selected === false)).toBe(true)
    expect(tree!.root.findAllByType(ReactNative.FlatList)[0]!.props.data).toEqual(ids)
  }
  await act(() => { tree!.update(list(['another', 'next-day'])) })
  expect(idleCallbacks).toHaveLength(0)
})

it.each([
  { nested: false, reduced: false }, { nested: true, reduced: false },
  { nested: false, reduced: true }, { nested: true, reduced: true },
])('settles a real drag and emits reordered items (nested: $nested, reduced: $reduced)', async ({ nested, reduced }) => {
  let animatedValues!: AnimatedValues
  const onDrop = vi.fn()
  await act(() => { tree = TestRenderer.create(<ListFixture nested={nested} reduced={reduced} ids={['first', 'second']}
    onValues={(values) => { animatedValues = values }} onDrop={onDrop} />) })
  await act(() => { pressRow(0) })
  expect(animatedValues.activeIndexAnim.value).toBe(0)
  expect(selectedRows()[0]!.selected).toBe(true)
  if (nested) expect(tree!.root.findAllByType(ReactNative.ScrollView)[0]!.props.scrollEnabled).toBe(false)
  animatedValues.spacerIndexAnim.value = 1
  animatedValues.placeholderOffset.value = 48
  animatedValues.activeCellOffset.value = 0
  await act(() => { nativeRuntime.endPan({ state: State.END, translationX: 0, translationY: 48 }) })
  expect(onDrop).toHaveBeenCalledExactlyOnceWith({ from: 0, to: 1, data: ['second', 'first'] })
  expect(nativeRuntime.springs).toEqual([{ target: 48, configuration: expect.objectContaining(createListCellMotion(reduced).animationConfig) }])
  expect(selectedRows()[0]!.selected).toBe(false)
  if (nested) expect(tree!.root.findAllByType(ReactNative.ScrollView)[0]!.props.scrollEnabled).toBe(true)
})
