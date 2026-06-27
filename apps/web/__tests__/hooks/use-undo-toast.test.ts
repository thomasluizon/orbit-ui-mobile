import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoToast } from '@/hooks/use-undo-toast'

const mockShowQueued = vi.fn(
  (
    _message: string,
    _label?: string,
    _onAction?: () => void,
    _onClose?: () => void,
  ): string | number => 'toast-1',
)
const mockDismissToast = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showToast: vi.fn(),
    showQueued: mockShowQueued,
    dismissToast: mockDismissToast,
  }),
}))

function pressKey(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', init))
  })
}

describe('useUndoToast', () => {
  beforeEach(() => {
    mockShowQueued.mockClear()
    mockShowQueued.mockReturnValue('toast-1')
    mockDismissToast.mockClear()
  })

  it('shows a queued toast wired to the undo action and label', () => {
    const { result } = renderHook(() => useUndoToast())
    const performRestore = vi.fn()

    act(() => {
      result.current('Habit deleted', performRestore)
    })

    expect(mockShowQueued).toHaveBeenCalledWith(
      'Habit deleted',
      'undo.action',
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('triggers undo on Ctrl+Z, dismisses the toast, and removes the listener', () => {
    const { result } = renderHook(() => useUndoToast())
    const performRestore = vi.fn()

    act(() => {
      result.current('Habit deleted', performRestore)
    })

    pressKey({ key: 'z', ctrlKey: true })

    expect(performRestore).toHaveBeenCalledTimes(1)
    expect(mockDismissToast).toHaveBeenCalledWith('toast-1')

    pressKey({ key: 'z', ctrlKey: true })
    expect(performRestore).toHaveBeenCalledTimes(1)
  })

  it('triggers undo on Cmd+Z (metaKey)', () => {
    const { result } = renderHook(() => useUndoToast())
    const performRestore = vi.fn()

    act(() => {
      result.current('Habit deleted', performRestore)
    })

    pressKey({ key: 'z', metaKey: true })

    expect(performRestore).toHaveBeenCalledTimes(1)
  })

  it('ignores the redo shortcut (Ctrl+Shift+Z)', () => {
    const { result } = renderHook(() => useUndoToast())
    const performRestore = vi.fn()

    act(() => {
      result.current('Habit deleted', performRestore)
    })

    pressKey({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(performRestore).not.toHaveBeenCalled()

    const onClose = mockShowQueued.mock.calls.at(-1)![3] as () => void
    act(() => {
      onClose()
    })
  })

  it('runs the same undo when the action button is pressed', () => {
    const { result } = renderHook(() => useUndoToast())
    const performRestore = vi.fn()

    act(() => {
      result.current('Habit deleted', performRestore)
    })

    const performUndo = mockShowQueued.mock.calls.at(-1)![2] as () => void
    act(() => {
      performUndo()
    })

    expect(performRestore).toHaveBeenCalledTimes(1)
  })

  it('removes the listener when the toast closes without an undo', () => {
    const { result } = renderHook(() => useUndoToast())
    const performRestore = vi.fn()

    act(() => {
      result.current('Habit deleted', performRestore)
    })

    const onClose = mockShowQueued.mock.calls.at(-1)![3] as () => void
    act(() => {
      onClose()
    })

    pressKey({ key: 'z', ctrlKey: true })
    expect(performRestore).not.toHaveBeenCalled()
  })
})
