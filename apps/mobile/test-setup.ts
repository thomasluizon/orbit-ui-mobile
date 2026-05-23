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
    data: unknown[],
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
    data?: unknown[]
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
    currentScheme: 'purple',
    currentTheme: 'dark',
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

vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({
    isInitialized: true,
    canClaimReward: true,
    rewardsClaimedToday: 0,
    dailyRewardCap: 3,
    shouldShowAds: () => true,
    initialize: async () => {},
    showInterstitialIfDue: async () => {},
    showRewardedAd: async () => false,
    markRewardClaimed: () => {},
  }),
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
