import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGoalProgressFormState } from '@/components/goals/goal-detail-drawer/use-goal-progress-form-state'

const mockShowError = vi.fn()
const mockMutateAsync = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showToast: vi.fn(),
    showQueued: vi.fn(),
    dismissToast: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-goals', () => ({
  useUpdateGoalProgress: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

function defaultProps(overrides: Partial<Parameters<typeof useGoalProgressFormState>[0]> = {}) {
  return {
    open: true,
    goalId: 'g-1',
    goalCurrentValue: 5,
    goalTargetValue: 10,
    refetchDetail: vi.fn(),
    onOpenChange: vi.fn(),
    ...overrides,
  }
}

describe('useGoalProgressFormState', () => {
  beforeEach(() => {
    mockShowError.mockReset()
    mockMutateAsync.mockReset()
    mockMutateAsync.mockResolvedValue(undefined)
  })

  it('snapshots the current value when the drawer opens', () => {
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    expect(result.current.progressValue).toBe(5)
    expect(result.current.showProgressForm).toBe(false)
    expect(result.current.isProgressDirty).toBe(false)
  })

  it('flags progress that exceeds the target once the form is open', () => {
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    act(() => result.current.openProgressForm())
    expect(result.current.showProgressForm).toBe(true)
    act(() => result.current.setProgressValue(15))
    expect(result.current.progressExceedsTarget).toBe(true)
    act(() => result.current.setProgressValue(3))
    expect(result.current.progressExceedsTarget).toBe(false)
  })

  it('tracks dirtiness from a changed note', () => {
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    act(() => result.current.openProgressForm())
    expect(result.current.isProgressDirty).toBe(false)
    act(() => result.current.setProgressNote('halfway'))
    expect(result.current.isProgressDirty).toBe(true)
  })

  it('submits the trimmed note and resets the form on success', async () => {
    const props = defaultProps()
    const { result } = renderHook(() => useGoalProgressFormState(props))
    act(() => result.current.openProgressForm())
    act(() => {
      result.current.setProgressValue(8)
      result.current.setProgressNote('  done  ')
    })

    await act(async () => {
      await result.current.submitProgress()
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      goalId: 'g-1',
      data: { currentValue: 8, note: 'done' },
    })
    expect(props.refetchDetail).toHaveBeenCalledTimes(1)
    expect(result.current.showProgressForm).toBe(false)
    expect(result.current.progressValue).toBeNull()
  })

  it('shows a validation error and skips the mutation for an empty value', async () => {
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    act(() => result.current.openProgressForm())
    act(() => result.current.setProgressValue(null))

    await act(async () => {
      await result.current.submitProgress()
    })

    expect(mockShowError).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('surfaces a friendly error when the mutation rejects', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    act(() => result.current.openProgressForm())
    act(() => result.current.setProgressValue(4))

    await act(async () => {
      await result.current.submitProgress()
    })

    expect(mockShowError).toHaveBeenCalledTimes(1)
  })

  it('dismisses the drawer directly when nothing is dirty', () => {
    const props = defaultProps()
    const { result } = renderHook(() => useGoalProgressFormState(props))
    act(() => result.current.requestProgressDismiss('drawer'))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(result.current.showProgressDiscardDialog).toBe(false)
  })

  it('closes the form directly when the form is clean', () => {
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    act(() => result.current.openProgressForm())
    act(() => result.current.requestProgressDismiss('form'))
    expect(result.current.showProgressForm).toBe(false)
  })

  it('opens the discard dialog when dismissing a dirty form', () => {
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    act(() => result.current.openProgressForm())
    act(() => result.current.setProgressNote('unsaved'))
    act(() => result.current.requestProgressDismiss('form'))
    expect(result.current.showProgressDiscardDialog).toBe(true)
  })

  it('confirms a pending drawer dismissal', () => {
    const props = defaultProps()
    const { result } = renderHook(() => useGoalProgressFormState(props))
    act(() => result.current.openProgressForm())
    act(() => result.current.setProgressNote('unsaved'))
    act(() => result.current.requestProgressDismiss('drawer'))
    act(() => result.current.confirmProgressDismiss())
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(result.current.showProgressDiscardDialog).toBe(false)
  })

  it('cancels a pending dismissal and keeps the form open', () => {
    const { result } = renderHook(() => useGoalProgressFormState(defaultProps()))
    act(() => result.current.openProgressForm())
    act(() => result.current.setProgressNote('unsaved'))
    act(() => result.current.requestProgressDismiss('form'))
    act(() => result.current.cancelProgressDismiss())
    expect(result.current.showProgressDiscardDialog).toBe(false)
    expect(result.current.showProgressForm).toBe(true)
  })
})
