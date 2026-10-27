import React from 'react'
import { PanResponder, StyleSheet } from 'react-native'
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
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
    route.pathname = '/calendar'
    useAppToastStore.setState({ currentToast: null, queue: [] })
    vi.spyOn(PanResponder, 'create').mockImplementation((callbacks) => {
      const movement = { stateID: 1, moveX: 0, moveY: 0, x0: 0, y0: 0, dx: 0, dy: 0, vx: 0, vy: 0, numberActiveTouches: 1, _accountsForMovesUpTo: 0 }
      return {
        panHandlers: {
          onMoveShouldSetResponder: (event) => callbacks.onMoveShouldSetPanResponder?.(event, movement) ?? false,
          onResponderGrant: (event) => {
            movement.dx = 0
            movement.dy = 0
            callbacks.onPanResponderGrant?.(event, movement)
            return true
          },
          onResponderMove: (event) => {
            movement.dx = event.nativeEvent.pageX
            movement.dy = event.nativeEvent.pageY
            callbacks.onPanResponderMove?.(event, movement)
          },
          onResponderRelease: (event) => callbacks.onPanResponderRelease?.(event, movement),
        },
        getInteractionHandle: () => null,
      }
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
    return tree.root.findAllByProps({ testID: 'toast-neutral' }).filter((node: { props: { accessibilityElementsHidden?: boolean } }) => !node.props.accessibilityElementsHidden)
  }

  it.each(['showError', 'showInfo', 'showSuccess'] as const)('closes a hosted %s without leaving stale store state', (method) => {
    useAppToastStore.getState()[method]('Feedback')
    mount()
    const close = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'common.close')[0]
    expect(close).toBeDefined()
    act(() => close.props.onPress())
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(tree.root.findAllByProps({ accessibilityLabel: 'common.close' })).toHaveLength(0)
  })

  it.each(['neutral', 'working', 'done', 'lost'] as const)('allows horizontal swipe on a %s toast', (kind) => {
    const dismissed = vi.fn()
    const variants = {
      neutral: <Toast kind="neutral" message="Feedback" onDismiss={dismissed} />,
      working: <Toast kind="working" message="Feedback" onDismiss={dismissed} />,
      done: <Toast kind="done" message="Feedback" onDone={vi.fn()} onDismiss={dismissed} />,
      lost: <Toast persistent kind="lost" message="Feedback" detail="Try again" actionLabel="Retry" onAction={vi.fn()} />,
    }
    mount(variants[kind])
    const handlers = vi.mocked(PanResponder.create).mock.calls.at(-1)![0]
    const event = {} as Parameters<NonNullable<typeof handlers.onMoveShouldSetPanResponder>>[0]
    const gesture = { dx: 60, dy: 0 } as Parameters<NonNullable<typeof handlers.onMoveShouldSetPanResponder>>[1]
    expect(handlers.onMoveShouldSetPanResponder?.(event, { ...gesture, dx: 0, dy: 60 })).toBe(false)
    expect(handlers.onMoveShouldSetPanResponder?.(event, gesture)).toBe(true)
    act(() => handlers.onPanResponderRelease?.(event, { ...gesture, dx: 24 }))
    expect(tree.root.findAllByProps({ testID: `toast-${kind}` }).length).toBeGreaterThan(0)
    act(() => handlers.onPanResponderRelease?.(event, gesture))
    expect(tree.root.findAllByProps({ testID: `toast-${kind}` })).toHaveLength(0)
  })

  it('runs an icon retry once without dismissing the failed notice', () => {
    const retry = vi.fn()
    const dismissed = vi.fn()
    mount(<Toast kind="neutral" message="notifications.deleteError" actionLabel="common.retry" actionIcon="refresh" onAction={retry} onDone={dismissed} />)
    const action = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'common.retry')[0]
    act(() => action.props.onPress())
    expect(retry).toHaveBeenCalledOnce()
    expect(dismissed).not.toHaveBeenCalled()
  })

  it('retries the failed deletion from the notice host', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('Unavailable'))
    queuePendingNotificationDelete('notification', execute)
    mount(<NotificationDeleteNotice />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    execute.mockClear()
    const action = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'common.retry')[0]
    act(() => action.props.onPress())
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notification'])
    expect(execute).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(execute).toHaveBeenCalledOnce()
    expect(tree.root.findAllByProps({ accessibilityLabel: 'common.retry' }).length).toBeGreaterThan(0)
  })

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

  it('dismisses a horizontal swipe through a plain host without invoking undo', () => {
    const undo = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo)
    mount()
    const host = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      typeof node.type === 'string' && node.props.testID === 'toast-neutral')[0]
    expect(host.type).toBe('View')
    const event = (dx: number, dy = 0) => ({ nativeEvent: { pageX: dx, pageY: dy } })
    expect(host.props.onMoveShouldSetResponder(event(0))).toBe(false)
    act(() => host.props.onResponderGrant(event(0)))
    act(() => host.props.onResponderMove(event(2)))
    expect(host.props.onMoveShouldSetResponder(event(2))).toBe(false)
    act(() => host.props.onResponderMove(event(8, 80)))
    expect(host.props.onMoveShouldSetResponder(event(8, 80))).toBe(false)
    act(() => host.props.onResponderRelease(event(8, 80)))
    expect(visibleToasts()).not.toHaveLength(0)
    act(() => host.props.onResponderGrant(event(0)))
    act(() => host.props.onResponderMove(event(20)))
    expect(host.props.onMoveShouldSetResponder(event(20))).toBe(true)
    act(() => host.props.onResponderRelease(event(20)))
    expect(visibleToasts()).not.toHaveLength(0)
    act(() => host.props.onResponderGrant(event(0)))
    act(() => host.props.onResponderMove(event(-80)))
    expect(host.props.onMoveShouldSetResponder(event(-80))).toBe(true)
    act(() => host.props.onResponderRelease(event(-80)))
    expect(visibleToasts()).toHaveLength(0)
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(undo).not.toHaveBeenCalled()
  })

  it('runs undo only when its nested action is tapped', () => {
    const undo = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo)
    mount()
    const action = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && node.props.testID === 'toast-action')[0]
    act(() => action.props.onPress())
    expect(undo).toHaveBeenCalledOnce()
    expect(visibleToasts()).toHaveLength(0)
  })

  it('pauses on host hover and resumes the remaining lifetime on pointer leave', () => {
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', vi.fn())
    mount()
    act(() => { vi.advanceTimersByTime(2000) })
    const host = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      typeof node.type === 'string' && node.props.testID === 'toast-neutral')[0]
    act(() => host.props.onPointerEnter())
    act(() => { vi.advanceTimersByTime(30000) })
    expect(visibleToasts()).not.toHaveLength(0)
    act(() => host.props.onPointerLeave())
    act(() => { vi.advanceTimersByTime(2999) })
    expect(visibleToasts()).not.toHaveLength(0)
    act(() => { vi.advanceTimersByTime(1) })
    expect(visibleToasts()).toHaveLength(0)
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
