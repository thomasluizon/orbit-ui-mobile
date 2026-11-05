import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const network = vi.hoisted(() => ({ available: true, pending: [] as (() => void)[] }))
let feedbackImported: Promise<void>
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

beforeAll(() => { vi.useFakeTimers() })
afterAll(() => { vi.useRealTimers() })

beforeEach(() => {
  vi.resetModules()
  network.available = true
  feedbackImported = new Promise<void>((resolve) => {
    vi.doMock('@/components/ui/toast', async (importOriginal) => {
      if (!network.available) await new Promise<void>((resume) => { network.pending.push(resume) })
      const presentation = await importOriginal()
      resolve()
      return presentation
    })
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
  await act(async () => { await vi.runAllTimersAsync() })
  vi.restoreAllMocks()
})

async function waitForFeedbackImport() {
  await act(async () => { await feedbackImported; await vi.dynamicImportSettled() })
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

describe.each(['loading', 'complete'] as const)('document %s', (readyState) => {
  let retry: ReturnType<typeof vi.fn<() => void>>
  let showFailure: () => void

  beforeEach(async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue(readyState)
    const { AppToastHost } = await import('@/components/ui/app-toast-host')
    const { useAppToastStore } = await import('@/stores/app-toast-store')
    retry = vi.fn()
    showFailure = () => {
      useAppToastStore.getState().showToast({ kind: 'neutral', message: 'Connection failed', actionLabel: 'Retry', onAction: retry })
    }
    render(<><button type="button">Keep focus</button><AppToastHost /></>)
    await waitForFeedbackImport()
    expect(screen.queryByRole('status')).toBeNull()
  }, 45000)

  it('renders the first offline failure and action after mounting', async () => {
    network.available = false
    act(showFailure)
    await act(async () => { await vi.dynamicImportSettled() })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await vi.waitFor(() => expect(screen.getByText('Connection failed')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

it('renders the first failed-delete retry offline and pauses its deadline on hover and focus', async () => {
  const { NotificationDeleteNotice } = await import('@/components/navigation/notification-delete-notice')
  const { queuePendingNotificationDelete, dismissPendingNotificationDeleteNotice, FAILED_DELETE_NOTICE_LIFE_MS } = await import('@/lib/pending-notification-deletes')
  const execute = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined)
  render(<><button type="button">Keep focus</button><NotificationDeleteNotice /></>)
  await waitForFeedbackImport()
  expect(screen.queryByRole('group')).toBeNull()
  network.available = false

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
  await waitForFeedbackImport()

  const focused = screen.getByRole('button', { name: 'Keep focus' })
  focused.focus()
  await act(async () => {
    useAppToastStore.getState().showQueued('Saved', 'Undo', onUndo)
    await vi.dynamicImportSettled()
  })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible())
  const undo = screen.getByRole('button', { name: 'Undo' })
  expect(undo).toBeVisible()
  expect(focused).toHaveFocus()
  fireEvent.click(undo)
  expect(onUndo).toHaveBeenCalledOnce()
  expect(focused).toHaveFocus()
})
