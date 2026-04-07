import { vi } from 'vitest'
import React from 'react'

vi.mock('react-native', () => {
  const createHostComponent = (name: string) => {
    return function HostComponent({
      children,
      ...props
    }: Readonly<{
      children?: React.ReactNode
      [key: string]: unknown
    }>) {
      return React.createElement(name, props, children)
    }
  }

  return {
    Animated: {
      Value: class AnimatedValue {
        constructor(public readonly value: number) {}
      },
      View: createHostComponent('AnimatedView'),
      timing: () => ({ start: () => {}, stop: () => {} }),
      sequence: (animations: Array<{ start?: () => void; stop?: () => void }>) => ({
        start: () => animations.forEach((animation) => animation.start?.()),
        stop: () => animations.forEach((animation) => animation.stop?.()),
      }),
      parallel: (animations: Array<{ start?: () => void; stop?: () => void }>) => ({
        start: () => animations.forEach((animation) => animation.start?.()),
        stop: () => animations.forEach((animation) => animation.stop?.()),
      }),
      loop: (animation: { start?: () => void; stop?: () => void }) => animation,
      event: () => () => {},
    },
    FlatList: createHostComponent('FlatList'),
    Image: createHostComponent('Image'),
    Modal: createHostComponent('Modal'),
    Platform: {
      OS: 'android',
      select: <T,>(values: { android?: T; default?: T }) => values.android ?? values.default,
    },
    Pressable: createHostComponent('Pressable'),
    ScrollView: createHostComponent('ScrollView'),
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T) => styles,
      flatten: (style: unknown) => style,
    },
    Text: createHostComponent('Text'),
    TextInput: createHostComponent('TextInput'),
    TouchableOpacity: createHostComponent('TouchableOpacity'),
    View: createHostComponent('View'),
  }
})

vi.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}))

vi.mock('react-native-reanimated', async () => {
  const reanimated = await import('react-native-reanimated/mock')
  return reanimated
})

vi.mock('react-native-draggable-flatlist', () => {
  function renderComponentProp(component: unknown) {
    if (!component) return null
    if (React.isValidElement(component)) return component
    if (typeof component === 'function') {
      return React.createElement(component as React.ComponentType)
    }
    return null
  }

  function renderDraggableItems(
    data: Array<unknown>,
    renderItem?: (params: {
      item: unknown
      index: number
      drag: () => void
      getIndex: () => number
      isActive: boolean
    }) => React.ReactNode,
  ) {
    return data.map((item, index) =>
      renderItem?.({
        item,
        index,
        drag: () => {},
        getIndex: () => index,
        isActive: false,
      }),
    )
  }

  function DraggableFlatList({
    data = [],
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    children,
    ...props
  }: Readonly<{
    data?: Array<unknown>
    renderItem?: (params: {
      item: unknown
      index: number
      drag: () => void
      getIndex: () => number
      isActive: boolean
    }) => React.ReactNode
    ListHeaderComponent?: React.ReactNode
    ListEmptyComponent?: React.ReactNode
    ListFooterComponent?: React.ReactNode
    children?: React.ReactNode
    [key: string]: unknown
  }>) {
    const renderedItems =
      data.length === 0
        ? [renderComponentProp(ListEmptyComponent)]
        : renderDraggableItems(data, renderItem)

    return React.createElement(
      'DraggableFlatList',
      props,
      React.createElement(
        React.Fragment,
        null,
        renderComponentProp(ListHeaderComponent),
        ...renderedItems,
        renderComponentProp(ListFooterComponent),
        children,
      ),
    )
  }

  return {
    __esModule: true,
    default: DraggableFlatList,
  }
})
