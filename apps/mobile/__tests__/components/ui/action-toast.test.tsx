import React from 'react'
import { PanResponder, StyleSheet, type PanResponderCallbacks } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppToast, Toast } from '@/components/ui/app-toast'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { getPendingNotificationDeleteIdsSnapshot, queuePendingNotificationDelete, resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { useAppToastNavigation } from '@/hooks/use-app-toast-navigation'
import { useAppToastStore } from '@/stores/app-toast-store'

const { act, create } = require('react-test-renderer')

const route = vi.hoisted(() => ({ pathname: '/calendar' }))
vi.mock('expo-router', () => ({ usePathname: () => route.pathname }))
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))

function NavigationOwner({ children }: Readonly<{ children?: React.ReactNode }>) {
  useAppToastNavigation(route.pathname)
  return children ?? <AppToast />
}

describe('Android action toast dismissal', () => {
  let tree: ReturnType<typeof create>
  let gesture: PanResponderCallbacks
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
    route.pathname = '/calendar'
    useAppToastStore.setState({ currentToast: null, queue: [] })
    vi.spyOn(PanResponder, 'create').mockImplementation((callbacks) => {
      gesture = callbacks
      return { panHandlers: {}, getInteractionHandle: () => null }
    })
  })
  afterEach(() => {
    act(() => tree?.unmount())
    vi.restoreAllMocks()
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })
  function mount(element = <NavigationOwner />) {
    act(() => { tree = create(element) })
  }
  function visibleToasts() {
    return tree.root.findAllByProps({ testID: 'toast-neutral' })
  }

  it('expires a hosted undo after five seconds without running undo', () => {
    const undo = vi.fn()
    const dismissed = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo, dismissed)
    mount()
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => tree.update(<NavigationOwner />))
    act(() => { vi.advanceTimersByTime(1999) })
    expect(visibleToasts()).not.toHaveLength(0)
    act(() => { vi.advanceTimersByTime(1) })
    expect(visibleToasts()).toHaveLength(0)
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(dismissed).toHaveBeenCalledOnce()
    expect(undo).not.toHaveBeenCalled()
  })

  it('dismisses a horizontal swipe but keeps taps and vertical movement', () => {
    const undo = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo)
    mount()
    const event = {} as Parameters<NonNullable<PanResponderCallbacks['onPanResponderRelease']>>[0]
    const movement = { stateID: 1, moveX: 0, moveY: 0, x0: 0, y0: 0, dx: 2, dy: 0, vx: 0, vy: 0, numberActiveTouches: 1, _accountsForMovesUpTo: 0 }
    expect(gesture.onMoveShouldSetPanResponder?.(event, movement)).toBe(false)
    expect(gesture.onMoveShouldSetPanResponder?.(event, { ...movement, dx: 8, dy: 80 })).toBe(false)
    expect(gesture.onMoveShouldSetPanResponder?.(event, { ...movement, dx: 80 })).toBe(true)
    act(() => gesture.onPanResponderRelease?.(event, { ...movement, dx: 20 }))
    expect(visibleToasts()).not.toHaveLength(0)
    act(() => gesture.onPanResponderRelease?.(event, { ...movement, dx: -80 }))
    expect(visibleToasts()).toHaveLength(0)
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(undo).not.toHaveBeenCalled()
  })

  it('clears visible and queued undos when the destination changes', () => {
    const undo = vi.fn()
    const dismissed = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo, dismissed)
    useAppToastStore.getState().showQueued('Habit archived', 'Undo', undo, dismissed)
    mount()
    act(() => tree.update(<NavigationOwner />))
    expect(visibleToasts()).not.toHaveLength(0)
    route.pathname = '/profile'
    act(() => tree.update(<NavigationOwner />))
    expect(visibleToasts()).toHaveLength(0)
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(useAppToastStore.getState().queue).toEqual([])
    expect(dismissed).toHaveBeenCalledTimes(2)
    expect(undo).not.toHaveBeenCalled()
  })

  it('expires a directly rendered action toast without a supplied completion callback', () => {
    mount(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(visibleToasts()).toHaveLength(0)
  })
  it('pauses while the close control has focus and draws its focus indicator', () => {
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', vi.fn())
    mount()
    const close = tree.root.findAll((node: { props: Record<string, unknown>; type: unknown }) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'common.close')[0]
    expect(close).toBeDefined()
    act(() => close.props.onFocus())
    expect(StyleSheet.flatten(close.props.style({ pressed: false })).outlineWidth).toBeGreaterThanOrEqual(2)
    act(() => { vi.advanceTimersByTime(30000) })
    expect(visibleToasts()).not.toHaveLength(0)
    act(() => close.props.onBlur())
    act(() => { vi.advanceTimersByTime(5000) })
    expect(visibleToasts()).toHaveLength(0)
  })

  it('clears the queue when a destination remounts the toast host', () => {
    const dismissed = vi.fn()
    useAppToastStore.getState().showQueued('Deleted', 'Undo', vi.fn(), dismissed)
    mount(<NavigationOwner><AppToast key="calendar" /></NavigationOwner>)
    route.pathname = '/wrapped'
    act(() => tree.update(<NavigationOwner><AppToast key="wrapped" placement="slot" /></NavigationOwner>))
    expect(visibleToasts()).toHaveLength(0)
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(dismissed).toHaveBeenCalledOnce()
  })

  it('keeps the original deadline when a caller recreates its completion callback', () => {
    const completed = vi.fn()
    mount(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} onDone={() => completed()} />)
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => tree.update(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} onDone={() => completed()} />))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(completed).toHaveBeenCalledOnce()
    expect(visibleToasts()).toHaveLength(0)
  })

  it('keeps a dismissed notification undo hidden across remounts while its delete still executes', () => {
    const execute = vi.fn()
    queuePendingNotificationDelete('notification', execute)
    mount(<NavigationOwner><NotificationDeleteNotice key="first" /></NavigationOwner>)
    const close = tree.root.findAll((node: { props: Record<string, unknown>; type: unknown }) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'common.close')[0]
    act(() => close.props.onPress())
    act(() => tree.update(<NavigationOwner><NotificationDeleteNotice key="second" /></NavigationOwner>))
    expect(visibleToasts()).toHaveLength(0)
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notification'])
    expect(execute).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('clears a notification retry even when navigation unmounts its notice', async () => {
    queuePendingNotificationDelete('notification', () => Promise.reject(new Error('Unavailable')))
    mount(<NavigationOwner><NotificationDeleteNotice /></NavigationOwner>)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(tree.root.findAllByProps({ accessibilityLabel: 'common.retry' }).length).toBeGreaterThan(0)
    route.pathname = '/wrapped'
    act(() => tree.update(<NavigationOwner><React.Fragment /></NavigationOwner>))
    route.pathname = '/calendar'
    act(() => tree.update(<NavigationOwner><NotificationDeleteNotice /></NavigationOwner>))
    expect(visibleToasts()).toHaveLength(0)
  })

})
