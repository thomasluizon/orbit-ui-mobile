import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { createElement } from 'react'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAppToastStore } from '@/stores/app-toast-store'

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
  it('renders a neutral error in the shell notice slot', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showError('x') })
    act(() => { vi.advanceTimersByTime(0) })
    expect(shell.container.querySelector('[data-shell-notice] [data-kind="neutral"]')).toHaveTextContent('x')
    expect(screen.getByRole('status')).toHaveTextContent('x')
  })

  it('keeps success for at least 5000ms', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showSuccess('Saved') })
    expect(shell.container.querySelector('[data-kind="done"]')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(shell.container.querySelector('[data-kind="done"]')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(shell.container.querySelector('[data-kind="done"]')).toBeNull()
  })

  it('keeps queued feedback until its text action runs', () => {
    vi.useFakeTimers()
    const onAction = vi.fn()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showQueued('Deleted', 'Desfazer', onAction) })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(shell.container.querySelector('[data-kind="neutral"]')).toBeInTheDocument()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })) })
    expect(onAction).toHaveBeenCalledOnce()
    expect(shell.container.querySelector('[data-kind="neutral"]')).toBeNull()
  })

  it('keeps error and info feedback without a timer or glyph', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAppToast())
    const shell = renderNotice()
    act(() => { result.current.showError('Error') })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(shell.container.querySelector('[data-kind="neutral"]')).toBeInTheDocument()
    expect(shell.container.querySelector('[aria-hidden="true"]')).toBeNull()
    act(() => { result.current.showInfo('Information') })
    act(() => { vi.advanceTimersByTime(0) })
    expect(screen.getByRole('status')).toHaveTextContent('Information')
  })

  it('offers one reload action for an account change', () => {
    const { result } = renderHook(() => useAppToast())
    renderNotice()
    act(() => { result.current.showPersistentError('Account changed', 'Reload') })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('returns stable store actions', () => {
    const { result, rerender } = renderHook(() => useAppToast())
    const first = result.current.showError
    rerender()
    expect(result.current.showError).toBe(first)
  })
})
