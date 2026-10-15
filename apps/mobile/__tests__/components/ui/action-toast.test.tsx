import React from 'react'
import { PanResponder, type PanResponderCallbacks } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppToast, Toast } from '@/components/ui/app-toast'
import { useAppToastStore } from '@/stores/app-toast-store'

const { act, create } = require('react-test-renderer')

const route = vi.hoisted(() => ({ pathname: '/calendar' }))
vi.mock('expo-router', () => ({ usePathname: () => route.pathname }))
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))

describe('Android action toast dismissal', () => {
  let tree: ReturnType<typeof create>
  let gesture: PanResponderCallbacks
  beforeEach(() => {
    vi.useFakeTimers()
    route.pathname = '/calendar'
    useAppToastStore.setState({ currentToast: null, queue: [] })
    vi.spyOn(PanResponder, 'create').mockImplementation((callbacks) => {
      gesture = callbacks
      return { panHandlers: {} }
    })
  })
  afterEach(() => {
    act(() => tree?.unmount())
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  function mount(element = <AppToast />) {
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
    act(() => tree.update(<AppToast />))
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
    act(() => tree.update(<AppToast />))
    expect(visibleToasts()).not.toHaveLength(0)
    route.pathname = '/profile'
    act(() => tree.update(<AppToast />))
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
})
