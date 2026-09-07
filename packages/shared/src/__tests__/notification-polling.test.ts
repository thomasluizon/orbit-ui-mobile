import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { focusManager, QueryClient } from '@tanstack/query-core'
import { attachNotificationPolling, notificationKeys, NOTIFICATIONS_REFETCH_INTERVAL } from '../query'

let queryClient: QueryClient
let releases: Array<() => void>

beforeEach(() => {
  vi.useFakeTimers()
  focusManager.setFocused(true)
  queryClient = new QueryClient()
  releases = []
})

afterEach(() => {
  releases.forEach((release) => release())
  queryClient.clear()
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('reference counts consumers and releases the timer and focus subscription only after the last detach', async () => {
  const interval = vi.spyOn(globalThis, 'setInterval')
  const clear = vi.spyOn(globalThis, 'clearInterval')
  const subscribe = vi.spyOn(focusManager, 'subscribe')
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const first = attachNotificationPolling(queryClient)
  releases.push(first)
  await vi.advanceTimersByTimeAsync(1000)
  const second = attachNotificationPolling(queryClient)
  releases.push(second)
  expect(interval).toHaveBeenCalledExactlyOnceWith(expect.any(Function), NOTIFICATIONS_REFETCH_INTERVAL)
  expect(subscribe).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: notificationKeys.lists() })
  first()
  expect(clear).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(invalidate).toHaveBeenCalledTimes(2)
  second()
  releases = []
  expect(clear).toHaveBeenCalledTimes(1)
  expect(focusManager.hasListeners()).toBe(false)
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(invalidate).toHaveBeenCalledTimes(2)
  releases.push(attachNotificationPolling(queryClient))
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(invalidate).toHaveBeenCalledTimes(3)
})

it('pauses an existing poll and gates a queued tick while unfocused before resuming', async () => {
  const interval = vi.spyOn(globalThis, 'setInterval')
  const clear = vi.spyOn(globalThis, 'clearInterval')
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  releases.push(attachNotificationPolling(queryClient), attachNotificationPolling(queryClient))
  const tick = interval.mock.calls[0]![0] as () => void
  focusManager.setFocused(false)
  expect(clear).toHaveBeenCalledTimes(1)
  tick()
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL * 2)
  expect(invalidate).not.toHaveBeenCalled()
  focusManager.setFocused(true)
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: notificationKeys.lists() })
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(invalidate).toHaveBeenCalledTimes(2)
  expect(interval).toHaveBeenCalledTimes(2)
})

it('waits for focus on initial attach and shares its timer across distinct query clients', async () => {
  focusManager.setFocused(false)
  const otherClient = new QueryClient()
  const interval = vi.spyOn(globalThis, 'setInterval')
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const invalidateOther = vi.spyOn(otherClient, 'invalidateQueries')
  const first = attachNotificationPolling(queryClient)
  releases.push(first, attachNotificationPolling(otherClient), attachNotificationPolling(otherClient))
  expect(interval).not.toHaveBeenCalled()
  focusManager.setFocused(true)
  expect.soft(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: notificationKeys.lists() })
  expect.soft(invalidateOther).toHaveBeenCalledExactlyOnceWith({ queryKey: notificationKeys.lists() })
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(interval).toHaveBeenCalledTimes(1)
  expect(invalidate).toHaveBeenCalledTimes(2)
  expect(invalidateOther).toHaveBeenCalledTimes(2)
  first()
  releases.shift()
  await vi.advanceTimersByTimeAsync(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(invalidate).toHaveBeenCalledTimes(2)
  expect(invalidateOther).toHaveBeenCalledTimes(3)
  otherClient.clear()
})
