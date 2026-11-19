import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import {
  FAILED_DELETE_NOTICE_LIFE_MS,
  getNotificationDeleteNoticeSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
} from '@/lib/pending-notification-deletes'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

async function renderNotice() {
  render(<NotificationDeleteNotice />)
  act(() => { queuePendingNotificationDelete('warm-up', vi.fn()) })
  await act(async () => { await vi.dynamicImportSettled() })
  fireEvent.click(screen.getByRole('button', { name: 'notifications.deleteUndo' }))
}

describe('notification delete notice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
  })
  afterEach(() => {
    cleanup()
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  it('shows one toast after three deletes and undoes only the newest', async () => {
    const executions = [vi.fn(), vi.fn(), vi.fn()]
    await renderNotice()
    for (const [index, execute] of executions.entries()) {
      act(() => { queuePendingNotificationDelete(`notification-${index}`, execute) })
    }

    expect(screen.getAllByRole('group')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.deleteUndo' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(executions[0]).toHaveBeenCalledOnce()
    expect(executions[1]).toHaveBeenCalledOnce()
    expect(executions[2]).not.toHaveBeenCalled()
  })

  it('does not bring an earlier delete back when the newest one is undone or closed', async () => {
    await renderNotice()
    act(() => {
      queuePendingNotificationDelete('first', vi.fn())
      queuePendingNotificationDelete('second', vi.fn())
    })
    fireEvent.click(screen.getByRole('button', { name: 'notifications.deleteUndo' }))
    expect(screen.queryByRole('group')).toBeNull()

    act(() => { queuePendingNotificationDelete('third', vi.fn()) })
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(screen.queryByRole('group')).toBeNull()
    expect(getNotificationDeleteNoticeSnapshot()).toBeNull()
  })

  it('lets an earlier pending delete finish on its own five second timer', async () => {
    const first = vi.fn()
    const second = vi.fn()
    await renderNotice()
    act(() => { queuePendingNotificationDelete('first', first) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    act(() => { queuePendingNotificationDelete('second', second) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  it('shows one failed toast after three failed deletes and retries only the newest', async () => {
    const executions = [0, 1, 2].map(() => vi.fn().mockRejectedValue(new Error('Unavailable')))
    await renderNotice()
    for (const [index, execute] of executions.entries()) {
      act(() => { queuePendingNotificationDelete(`notification-${index}`, execute) })
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(screen.getAllByRole('group')).toHaveLength(1)
    executions.forEach((execute) => execute.mockClear())
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(executions[0]).not.toHaveBeenCalled()
    expect(executions[1]).not.toHaveBeenCalled()
    expect(executions[2]).toHaveBeenCalledOnce()
  })

  it('keeps one toast when a failure lands while a newer undo is visible', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('Unavailable'))
    await renderNotice()
    act(() => { queuePendingNotificationDelete('failing', failing) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    act(() => { queuePendingNotificationDelete('newest', vi.fn()) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'notifications.deleteUndo' })).toBeInTheDocument()
  })
  it('does not bring an older failed delete back when the newer undo ends', async () => {
    await renderNotice()
    act(() => { queuePendingNotificationDelete('failing', vi.fn().mockRejectedValue(new Error('Unavailable'))) })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument()

    act(() => { queuePendingNotificationDelete('newest', vi.fn()) })
    fireEvent.click(screen.getByRole('button', { name: 'notifications.deleteUndo' }))

    expect(screen.queryByRole('group')).toBeNull()
  })

  it('gives a failed delete that replaces another failed toast its own full life', async () => {
    const failing = () => vi.fn().mockRejectedValue(new Error('Unavailable'))
    await renderNotice()
    act(() => { queuePendingNotificationDelete('first', failing()) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    act(() => { queuePendingNotificationDelete('second', failing()) })
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'first' })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'second' })

    await act(async () => { await vi.advanceTimersByTimeAsync(FAILED_DELETE_NOTICE_LIFE_MS - 500) })

    expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument()
    expect(getNotificationDeleteNoticeSnapshot()).toEqual({ kind: 'failed', id: 'second' })
  })
})
