import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppToast } from '@/hooks/use-app-toast'

// Mock sonner
const mockToast = vi.fn()
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign(
    (...args: unknown[]) => mockToast(...args),
    {
      error: (...args: unknown[]) => mockToastError(...args),
      success: (...args: unknown[]) => mockToastSuccess(...args),
    },
  ),
}))

describe('useAppToast', () => {
  it('calls the default toast helpers with the expected payloads', () => {
    const { result } = renderHook(() => useAppToast())
    const onUndo = vi.fn()

    act(() => {
      result.current.showToast('Saved')
      result.current.showInfo('FYI')
      result.current.showSuccess('Done')
      result.current.showQueued('Queued', 'Undo', onUndo)
      result.current.showQueued('Queued without action')
    })

    expect(mockToast).toHaveBeenCalledWith('Saved')
    expect(mockToast).toHaveBeenCalledWith('FYI', {
      duration: 4000,
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Done', {
      duration: 4000,
    })
    expect(mockToast).toHaveBeenCalledWith('Queued', {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: onUndo,
      },
    })
    expect(mockToast).toHaveBeenCalledWith('Queued without action', {
      duration: 6000,
      action: undefined,
    })
  })

  it('calls toast.error with message and duration', () => {
    const { result } = renderHook(() => useAppToast())

    act(() => {
      result.current.showError('Something went wrong')
    })

    expect(mockToastError).toHaveBeenCalledWith('Something went wrong', {
      duration: 5000,
    })
  })

  it('returns a stable showError function', () => {
    const { result, rerender } = renderHook(() => useAppToast())

    const firstRef = result.current.showError
    rerender()
    const secondRef = result.current.showError

    expect(firstRef).toBe(secondRef)
  })
})
