import { vi } from 'vitest'
import React from 'react'

;(globalThis as { __DEV__?: boolean }).__DEV__ = true

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

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  selectionAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

vi.mock('react-native-gesture-handler', () => {
  const React = require('react') as typeof import('react')
  return {
    Swipeable: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    RectButton: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('RectButton', null, children),
    GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    FlatList: React.forwardRef<unknown, { children?: React.ReactNode }>(
      ({ children }, _ref) => React.createElement('FlatList', null, children),
    ),
  }
})

vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetBackdrop: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('BottomSheetBackdrop', null, children),
  BottomSheetModal: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('BottomSheetModal', null, children),
  BottomSheetScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('BottomSheetScrollView', null, children),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      background: '#ffffff',
      border: '#cbd5e1',
      primary: '#2563eb',
      primary_10: '#dbeafe',
      primary_15: '#bfdbfe',
      primary_30: '#93c5fd',
      primary_80: '#3b82f6',
      success: '#16a34a',
      danger: '#dc2626',
      white: '#ffffff',
      textMuted: '#64748b',
      textSecondary: '#334155',
      textPrimary: '#0f172a',
      surface: '#ffffff',
      surfaceElevated: '#f8fafc',
      borderMuted: '#e2e8f0',
      amber400: '#f59e0b',
      amber500: '#d97706',
      red400: '#f87171',
      red500: '#ef4444',
      green400: '#4ade80',
      green500: '#22c55e',
      surfaceGround: '#f1f5f9',
    },
    radius: {
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      full: 999,
    },
    shadows: {
      sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 3 },
      md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12 },
      lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 40 },
    },
    applyScheme: vi.fn(),
  }),
}))

vi.mock('@/lib/theme-provider', () => ({
  useThemeContext: () => null,
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children, title }: { open: boolean; children?: React.ReactNode; title?: string }) =>
    open
      ? React.createElement(
          'BottomSheetModal',
          null,
          title ? React.createElement('Text', null, title) : null,
          children,
        )
      : null,
}))

vi.mock('@/components/ui/app-date-picker', () => ({
  AppDatePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    React.createElement('TextInput', {
      testID: 'date-picker',
      value,
      onChangeText: onChange,
    }),
}))

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
