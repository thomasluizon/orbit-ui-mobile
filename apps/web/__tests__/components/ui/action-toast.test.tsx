import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { Toast } from '@/components/ui/toast'
import { useAppToastStore } from '@/stores/app-toast-store'

const route = vi.hoisted(() => ({ pathname: '/calendar' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('action toast dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    route.pathname = '/calendar'
    useAppToastStore.setState({ currentToast: null, queue: [] })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('expires a hosted undo after five seconds without running undo', () => {
    const undo = vi.fn()
    const dismissed = vi.fn()
    useAppToastStore.getState().showQueued('Habit skipped', 'Undo', undo, dismissed)
    const view = render(<AppToastHost />)
    void act(() => vi.advanceTimersByTime(3000))
    view.rerender(<AppToastHost />)
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
    render(<AppToastHost />)
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
    const view = render(<AppToastHost />)
    view.rerender(<AppToastHost />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    route.pathname = '/profile'
    view.rerender(<AppToastHost />)
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
})
