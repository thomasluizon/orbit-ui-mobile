import React from 'react'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { __emitKeyboardEvent, __resetTestHostConfig, __setMeasureInWindowImpl, __setScrollToImpl, __setWindowDimensions } from '../../../test-mocks/react-native'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; footer?: React.ReactNode }> {
    present = vi.fn().mockResolvedValue(undefined)
    dismiss = vi.fn().mockResolvedValue(undefined)
    render() { return <>{this.props.children}{this.props.footer}</> }
  },
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), useIsFocused: () => true }))
vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHabitDetail: () => ({ data: null, isPending: false, error: null }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: undefined, isSuccess: false, isFetching: false, isError: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-config', async () => {
  const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config')
  return { useConfig: () => ({ config: DEFAULT_CONFIG }) }
})
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn().mockResolvedValue([]) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({}) }))

const TestRenderer = require('react-test-renderer')
let tree: ReturnType<typeof TestRenderer.create>

afterEach(() => {
  TestRenderer.act(() => tree?.unmount())
  __resetTestHostConfig()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Edit habit keyboard reachability', () => {
  it.each([
    { width: 360, height: 740, fontScale: 1, keyboardTop: 420, footerHeight: 76 },
    { width: 840, height: 740, fontScale: 2, keyboardTop: 400, footerHeight: 112 },
    { width: 740, height: 412, fontScale: 2, keyboardTop: 290, footerHeight: 76 },
  ])('keeps the checklist add field reachable at $width by $height and font scale $fontScale', async ({ width, height, fontScale, keyboardTop, footerHeight }) => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => { callback(0); return 0 })
    __setWindowDimensions({ width, height, fontScale, scale: 1 })
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<QueryClientProvider client={new QueryClient()}>
        <EditHabitModal open onClose={vi.fn()} habit={createMockHabit({ checklistItems: [{ text: 'Valor Mortis', isChecked: false }] })} />
      </QueryClientProvider>)
      await Promise.resolve()
    })
    const sheet = tree!.root.findByType(TrueSheet)
    TestRenderer.act(() => sheet.props.footer.props.onLayout({ nativeEvent: { layout: { height: footerHeight } } }))
    const scroller = tree!.root.findByType('ScrollView')
    const input = tree!.root.findAllByType('TextInput').find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'habits.form.checklistPlaceholder')!
    expect(input).toBeDefined()
    const viewportTop = 64
    const viewportHeight = height - viewportTop - footerHeight
    const inputHeight = Math.max(54, fontScale * 24 + 24)
    const contentHeight = viewportHeight + 300
    let scrollY = contentHeight - viewportHeight
    __setMeasureInWindowImpl((callback, _props, name) => name === 'ScrollView'
      ? callback(0, viewportTop, width, viewportHeight)
      : callback(0, contentHeight + viewportTop - inputHeight - scrollY, width, inputHeight))
    __setScrollToImpl(({ y = 0 }) => {
      const padding = StyleSheet.flatten(scroller.props.contentContainerStyle).paddingBottom ?? 0
      scrollY = Math.min(y, contentHeight + padding - viewportHeight)
    })
    TestRenderer.act(() => {
      scroller.props.onScroll({ nativeEvent: { contentOffset: { y: scrollY } } })
      scroller.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: viewportTop, width, height: viewportHeight } } })
      input.props.onFocus({ nativeEvent: { target: 1 } })
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: keyboardTop, height: height - keyboardTop, screenX: 0, width }, duration: 0, easing: 'keyboard' })
    })
    await TestRenderer.act(async () => { vi.advanceTimersByTime(80); await Promise.resolve() })
    TestRenderer.act(() => {
      scroller.props.onScroll({ nativeEvent: { contentOffset: { y: scrollY } } })
      scroller.props.onContentSizeChange?.(width, contentHeight + StyleSheet.flatten(scroller.props.contentContainerStyle).paddingBottom)
    })
    const inputBottom = contentHeight + viewportTop - scrollY
    expect(inputBottom - inputHeight).toBeGreaterThanOrEqual(viewportTop + 24)
    expect(inputBottom).toBeLessThanOrEqual(keyboardTop - footerHeight - 24)
    TestRenderer.act(() => input.props.onChangeText('Another item'))
    expect(tree!.root.findAllByType('TextInput').find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'habits.form.checklistPlaceholder')!.props.value).toBe('Another item')
  })
})
