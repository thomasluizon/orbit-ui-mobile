import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const network = vi.hoisted(() => ({ available: true, pending: [] as (() => void)[] }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

beforeEach(() => {
  vi.resetModules()
  network.available = true
  vi.doMock('@/components/ui/toast', async (importOriginal) => {
    if (!network.available) await new Promise<void>((resolve) => { network.pending.push(resolve) })
    return importOriginal()
  })
})

afterEach(async () => {
  cleanup()
  network.available = true
  network.pending.splice(0).forEach((resolve) => resolve())
  await vi.dynamicImportSettled()
  const { useAppToastStore } = await import('@/stores/app-toast-store')
  useAppToastStore.setState({ currentToast: null, queue: [] })
  const { resetPendingNotificationDeletesForTests } = await import('@/lib/pending-notification-deletes')
  resetPendingNotificationDeletesForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it.each(['loading', 'complete'] as const)('renders the first offline failure and action after mounting with document %s', async (readyState) => {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(readyState)
  const { AppToastHost } = await import('@/components/ui/app-toast-host')
  const { useAppToastStore } = await import('@/stores/app-toast-store')
  const retry = vi.fn()
  render(<><button type="button">Keep focus</button><AppToastHost /></>)
  await act(async () => { await vi.dynamicImportSettled() })
  expect(screen.queryByRole('status')).toBeNull()
  network.available = false

  await act(async () => {
    useAppToastStore.getState().showToast({ kind: 'neutral', message: 'Connection failed', actionLabel: 'Retry', onAction: retry })
  })
  expect(await screen.findByText('Connection failed')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(retry).toHaveBeenCalledOnce()
})

it('renders the first failed-delete retry offline and pauses its deadline on hover and focus', async () => {
  const { NotificationDeleteNotice } = await import('@/components/navigation/notification-delete-notice')
  const { queuePendingNotificationDelete, dismissPendingNotificationDeleteNotice, FAILED_DELETE_NOTICE_LIFE_MS } = await import('@/lib/pending-notification-deletes')
  const execute = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined)
  render(<><button type="button">Keep focus</button><NotificationDeleteNotice /></>)
  await act(async () => { await vi.dynamicImportSettled() })
  expect(screen.queryByRole('group')).toBeNull()
  network.available = false
  vi.useFakeTimers()

  act(() => {
    queuePendingNotificationDelete('notification', execute)
    dismissPendingNotificationDeleteNotice('notification')
  })
  expect(screen.queryByRole('group')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  await vi.waitFor(() => expect(screen.getByRole('group', { name: 'notifications.deleteError' })).toBeVisible())
  const retry = screen.getByRole('button', { name: 'common.retry' })
  expect(screen.queryByRole('button', { name: 'notifications.deleteUndo' })).toBeNull()
  fireEvent.pointerEnter(retry.closest('li')!)
  await act(async () => { await vi.advanceTimersByTimeAsync(FAILED_DELETE_NOTICE_LIFE_MS * 2) })
  expect(retry).toBeVisible()
  act(() => { retry.focus() })
  fireEvent.pointerLeave(retry.closest('li')!)
  await act(async () => { await vi.advanceTimersByTimeAsync(FAILED_DELETE_NOTICE_LIFE_MS * 2) })
  expect(retry).toHaveFocus()
  fireEvent.click(retry)
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(execute).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('group')).toBeNull()
})

it('preserves background focus through the first feedback action', async () => {
  const { AppToastHost } = await import('@/components/ui/app-toast-host')
  const { NotificationDeleteNotice } = await import('@/components/navigation/notification-delete-notice')
  const { useAppToastStore } = await import('@/stores/app-toast-store')
  const onUndo = vi.fn()
  render(<><button type="button">Keep focus</button><AppToastHost /><NotificationDeleteNotice /></>)
  await act(async () => { await vi.dynamicImportSettled() })

  const focused = screen.getByRole('button', { name: 'Keep focus' })
  focused.focus()
  await act(async () => {
    useAppToastStore.getState().showQueued('Saved', 'Undo', onUndo)
    await vi.dynamicImportSettled()
  })
  const undo = await screen.findByRole('button', { name: 'Undo' })
  expect(focused).toHaveFocus()
  fireEvent.click(undo)
  expect(onUndo).toHaveBeenCalledOnce()
  expect(focused).toHaveFocus()
})
