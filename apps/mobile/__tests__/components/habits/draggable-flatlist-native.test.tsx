import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as ReactNative from 'react-native'
import type { DraggableFlatListProps } from 'react-native-draggable-flatlist'
const { default: DraggableFlatList } = await vi.importActual<{ default: typeof import('react-native-draggable-flatlist').default }>('react-native-draggable-flatlist/src/components/DraggableFlatList')

vi.mock('react-native', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/test-mocks/react-native')>(),
  InteractionManager: undefined,
}))

vi.mock('react-native-reanimated', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/test-mocks/react-native-reanimated')>(),
  useAnimatedReaction: () => {},
  useSharedValue: <Value,>(initial: Value) => React.useState(() => ({ value: initial }))[0],
  useDerivedValue: <Value,>(updater: () => Value) => ({ get value() { return updater() } }),
  runOnUI: <Args extends unknown[],>(callback: (...args: Args) => void) => callback,
}))

vi.mock('react-native-gesture-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/test-mocks/react-native-gesture-handler')>()
  const pan = () => {
    const gesture = {
      onBegin: () => gesture,
      onUpdate: () => gesture,
      onEnd: () => gesture,
      onTouchesDown: () => gesture,
      onTouchesUp: () => gesture,
    }
    return gesture
  }
  return { ...actual, FlatList: ReactNative.FlatList, Gesture: { ...actual.Gesture, Pan: pan } }
})

let tree: ReturnType<typeof TestRenderer.create> | undefined
const idleCallbacks: (() => void)[] = []
beforeEach(() => {
  renderError.mockClear()
  idleCallbacks.length = 0
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
  let animatedValues!: Parameters<NonNullable<DraggableFlatListProps<string>['onAnimValInit']>>[0]
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
