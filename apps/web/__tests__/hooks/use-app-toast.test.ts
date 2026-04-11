import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppToast } from '@/hooks/use-app-toast'

// Mock sonner
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

describe('useAppToast', () => {
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
