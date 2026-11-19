import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import {
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
} from '@/lib/pending-notification-deletes'

const { act, create } = require('react-test-renderer')

vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))

type TestNode = { type: unknown; props: Record<string, unknown> }

describe('notification delete notice', () => {
  let tree: ReturnType<typeof create>
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
    act(() => { tree = create(<NotificationDeleteNotice />) })
  })
  afterEach(() => {
    act(() => tree.unmount())
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  function toastCount() {
    return tree.root.findAll((node: TestNode) => typeof node.type === 'string' && node.props.testID === 'toast-neutral').length
  }
  function press(label: string) {
    const action = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]
    act(() => (action.props.onPress as () => void)())
  }
  function queue(id: string, execute: () => unknown) {
    act(() => { queuePendingNotificationDelete(id, execute) })
  }

  it('shows one toast after three deletes and undoes only the newest', async () => {
    const executions = [vi.fn(), vi.fn(), vi.fn()]
    for (const [index, execute] of executions.entries()) queue(`notification-${index}`, execute)

    expect(toastCount()).toBe(1)
    press('notifications.deleteUndo')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(executions[0]).toHaveBeenCalledOnce()
    expect(executions[1]).toHaveBeenCalledOnce()
    expect(executions[2]).not.toHaveBeenCalled()
  })

  it('does not bring an earlier delete back when the newest one is undone or closed', () => {
    queue('first', vi.fn())
    queue('second', vi.fn())
    press('notifications.deleteUndo')
    expect(toastCount()).toBe(0)

    queue('third', vi.fn())
    press('common.close')
    expect(toastCount()).toBe(0)
  })

  it('lets an earlier pending delete finish on its own five second timer', async () => {
    const first = vi.fn()
    const second = vi.fn()
    queue('first', first)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    queue('second', second)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    expect(toastCount()).toBe(1)
  })

  it('shows one failed toast after three failed deletes and retries only the newest', async () => {
    const executions = [0, 1, 2].map(() => vi.fn().mockRejectedValue(new Error('Unavailable')))
    for (const [index, execute] of executions.entries()) queue(`notification-${index}`, execute)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(toastCount()).toBe(1)
    executions.forEach((execute) => execute.mockClear())
    press('common.retry')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(executions[0]).not.toHaveBeenCalled()
    expect(executions[1]).not.toHaveBeenCalled()
    expect(executions[2]).toHaveBeenCalledOnce()
  })

  it('keeps one toast when a failure lands while a newer undo is visible', async () => {
    queue('failing', vi.fn().mockRejectedValue(new Error('Unavailable')))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    queue('newest', vi.fn())
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(toastCount()).toBe(1)
    expect(tree.root.findAllByProps({ accessibilityLabel: 'notifications.deleteUndo' }).length).toBeGreaterThan(0)
  })
})
