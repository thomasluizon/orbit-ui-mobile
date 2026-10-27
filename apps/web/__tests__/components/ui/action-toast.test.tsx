import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { Toast } from '@/components/ui/toast'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { getPendingNotificationDeleteIdsSnapshot, queuePendingNotificationDelete, resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { NavigationHistoryTracker } from '@/components/navigation/navigation-history-tracker'
import { useAppToastStore } from '@/stores/app-toast-store'

const route = vi.hoisted(() => ({ pathname: '/calendar' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function NavigationOwner({ children }: Readonly<{ children?: React.ReactNode }>) {
  return <><NavigationHistoryTracker />{children ?? <AppToastHost />}</>
}

describe('action toast dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetPendingNotificationDeletesForTests()
    route.pathname = '/calendar'
    useAppToastStore.setState({ currentToast: null, queue: [] })
  })
  afterEach(() => {
    cleanup()
    resetPendingNotificationDeletesForTests()
    vi.useRealTimers()
  })

  it('runs an icon retry once without dismissing the failed notice', () => {
    const retry = vi.fn()
    const dismissed = vi.fn()
    render(<Toast kind="neutral" message="notifications.deleteError" actionLabel="common.retry" actionIcon="refresh" onAction={retry} onDone={dismissed} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(dismissed).not.toHaveBeenCalled()
  })

  it.each(['showError', 'showInfo', 'showSuccess'] as const)('closes a hosted %s without leaving stale store state', async (method) => {
    useAppToastStore.getState()[method]('Feedback')
    render(<NavigationOwner />)
    await act(async () => { await vi.dynamicImportSettled() })
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(screen.queryByRole('group')).toBeNull()
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })

  it('closes a working toast without running an action', () => {
    const dismissed = vi.fn()
    render(<Toast kind="working" message="Syncing" onDismiss={dismissed} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(screen.queryByRole('group')).toBeNull()
    expect(dismissed).toHaveBeenCalledOnce()
  })

  it('retries the failed deletion from the notice host', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('Unavailable'))
    queuePendingNotificationDelete('notification', execute)
    render(<NotificationDeleteNotice />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    execute.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notification'])
    expect(execute).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(execute).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument()
  })

  it('expires a hosted undo after five seconds without running undo', async () => {
    const undo = vi.fn()
    const dismissed = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo, dismissed)
    const view = render(<NavigationOwner />)
    await act(async () => { await vi.dynamicImportSettled() })
    void act(() => vi.advanceTimersByTime(3000))
    view.rerender(<NavigationOwner />)
    void act(() => vi.advanceTimersByTime(1999))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    void act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(dismissed).toHaveBeenCalledOnce()
    expect(undo).not.toHaveBeenCalled()
  })

  it('closes a hosted undo manually without running undo', () => {
    const undo = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo)
    render(<NavigationOwner />)
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(undo).not.toHaveBeenCalled()
  })

  it('clears visible and queued undos when the destination changes', () => {
    const undo = vi.fn()
    const dismissed = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo, dismissed)
    useAppToastStore.getState().showQueued('Habit archived', 'Undo', undo, dismissed)
    const view = render(<NavigationOwner />)
    view.rerender(<NavigationOwner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    route.pathname = '/profile'
    view.rerender(<NavigationOwner />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(useAppToastStore.getState().queue).toEqual([])
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(dismissed).toHaveBeenCalledTimes(2)
    expect(undo).not.toHaveBeenCalled()
  })

  it('expires a directly rendered action toast without a supplied completion callback', () => {
    render(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} />)
    void act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('clears the queue when a destination remounts the toast host', () => {
    const dismissed = vi.fn()
    useAppToastStore.getState().showQueued('Deleted', 'Undo', vi.fn(), dismissed)
    const view = render(<NavigationOwner><AppToastHost key="calendar" /></NavigationOwner>)
    route.pathname = '/wrapped'
    view.rerender(<NavigationOwner><AppToastHost key="wrapped" placement="page" /></NavigationOwner>)
    expect(screen.queryByRole('status')).toBeNull()
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(dismissed).toHaveBeenCalledOnce()
  })

  it('keeps the original deadline when a caller recreates its completion callback', () => {
    const completed = vi.fn()
    const view = render(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} onDone={() => completed()} />)
    void act(() => vi.advanceTimersByTime(3000))
    view.rerender(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} onDone={() => completed()} />)
    void act(() => vi.advanceTimersByTime(2000))
    expect(completed).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps a dismissed notification undo hidden across remounts while its delete still executes', async () => {
    const execute = vi.fn()
    queuePendingNotificationDelete('notification', execute)
    const view = render(<NavigationOwner><NotificationDeleteNotice key="first" /></NavigationOwner>)
    await act(async () => { await vi.dynamicImportSettled() })
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    view.rerender(<NavigationOwner><NotificationDeleteNotice key="second" /></NavigationOwner>)
    expect(screen.queryByRole('status')).toBeNull()
    expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['notification'])
    expect(execute).not.toHaveBeenCalled()
    void act(() => vi.advanceTimersByTime(5000))
    expect(execute).toHaveBeenCalledOnce()
  })

  it('clears a notification retry even when navigation unmounts its notice', async () => {
    queuePendingNotificationDelete('notification', () => Promise.reject(new Error('Unavailable')))
    const view = render(<NavigationOwner><NotificationDeleteNotice /></NavigationOwner>)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument()
    route.pathname = '/wrapped'
    view.rerender(<NavigationOwner><div /></NavigationOwner>)
    route.pathname = '/calendar'
    view.rerender(<NavigationOwner><NotificationDeleteNotice /></NavigationOwner>)
    expect(screen.queryByRole('status')).toBeNull()
  })

})
