import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { createElement } from 'react'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAppToastStore } from '@/stores/app-toast-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function renderNotice() {
  return render(createElement('div', { 'data-shell-notice': '' }, createElement(AppToastHost)))
}

beforeEach(() => {
  useAppToastStore.setState({ currentToast: null, queue: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAppToast', () => {
  it('renders a neutral error in the shell notice slot', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showError('x') })
    await act(async () => { await vi.dynamicImportSettled() })
    act(() => { vi.advanceTimersByTime(40) })
    expect(shell.container.querySelector('[data-shell-notice] [data-kind="neutral"]')).toHaveTextContent('x')
    expect(screen.getByRole('status')).toHaveTextContent('x')
  })

  it('keeps success for at least 5000ms', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showSuccess('Saved') })
    await act(async () => { await vi.dynamicImportSettled() })
    expect(shell.container.querySelector('[data-kind="done"]')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(shell.container.querySelector('[data-kind="done"]')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(shell.container.querySelector('[data-kind="done"]')).toBeNull()
  })

  it('runs the queued action before its timeout', async () => {
    vi.useFakeTimers()
    const onAction = vi.fn()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showQueued('Deleted', 'Desfazer', onAction) })
    await act(async () => { await vi.dynamicImportSettled() })
    act(() => { vi.advanceTimersByTime(4999) })
    expect(shell.container.querySelector('[data-kind="neutral"]')).toBeInTheDocument()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })) })
    expect(onAction).toHaveBeenCalledOnce()
    expect(shell.container.querySelector('[data-kind="neutral"]')).toBeNull()
  })

  it('keeps error and info feedback until its close control is used', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showError('Error') })
    await act(async () => { await vi.dynamicImportSettled() })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(shell.container.querySelector('[data-kind="neutral"]')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument()
    act(() => { result.current.showInfo('Information') })
    act(() => { vi.advanceTimersByTime(40) })
    expect(screen.getByRole('status')).toHaveTextContent('Information')
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('offers one reload action for an account change', async () => {
    const { result } = renderHook(() => useAppToast())
    renderNotice()
    act(() => { result.current.showPersistentError('Account changed', 'Reload') })
    await act(async () => { await vi.dynamicImportSettled() })
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument()
  })

  it('returns stable store actions', () => {
    const { result, rerender } = renderHook(() => useAppToast())
    const first = result.current.showError
    rerender()
    expect(result.current.showError).toBe(first)
  })
})
