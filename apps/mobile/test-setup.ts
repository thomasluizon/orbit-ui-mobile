import { vi } from 'vitest'
import React from 'react'
vi.mock('react-native', async () => {
  const reactNative = await import('./test-mocks/react-native')
  return reactNative
})

vi.mock('react-native-reanimated', async () => {
  const reanimated = await import('./test-mocks/react-native-reanimated')
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

if (typeof require !== 'undefined' && require.extensions) {
  require.extensions['.png'] = (module: NodeModule) => {
    ;(module as NodeModule & { exports: string }).exports = 'test-asset'
  }
  require.extensions['.jpg'] = (module: NodeModule) => {
    ;(module as NodeModule & { exports: string }).exports = 'test-asset'
  }
  require.extensions['.jpeg'] = (module: NodeModule) => {
    ;(module as NodeModule & { exports: string }).exports = 'test-asset'
  }
  require.extensions['.webp'] = (module: NodeModule) => {
    ;(module as NodeModule & { exports: string }).exports = 'test-asset'
  }
}
