import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { createElement } from 'react'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { useAppToastStore } from '@/stores/app-toast-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function pressKey(init: KeyboardEventInit) {
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', init)) })
}

beforeEach(() => useAppToastStore.setState({ currentToast: null, queue: [] }))

describe('useUndoToast', () => {
  it('runs undo once on Ctrl+Z and removes the listener', () => {
    const { result } = renderHook(() => useUndoToast())
    const restore = vi.fn()
    act(() => { result.current('Habit deleted', restore) })
    expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({
      kind: 'neutral', message: 'Habit deleted', actionLabel: 'undo.action',
    })
    pressKey({ key: 'z', ctrlKey: true })
    pressKey({ key: 'z', ctrlKey: true })
    expect(restore).toHaveBeenCalledOnce()
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })

  it('runs the same undo from the text action', () => {
    const { result } = renderHook(() => useUndoToast())
    render(createElement(AppToastHost))
    const restore = vi.fn()
    act(() => { result.current('Habit deleted', restore) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'undo.action' })) })
    pressKey({ key: 'z', metaKey: true })
    expect(restore).toHaveBeenCalledOnce()
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })

  it('keeps the undo until it is dismissed', () => {
    const { result } = renderHook(() => useUndoToast())
    const restore = vi.fn()
    act(() => { result.current('Habit deleted', restore) })
    const id = useAppToastStore.getState().currentToast?.id
    act(() => { useAppToastStore.getState().dismissToast(id) })
    pressKey({ key: 'z', ctrlKey: true })
    expect(restore).not.toHaveBeenCalled()
  })

  it('only runs the visible undo shortcut when other undos are pending', () => {
    const { result } = renderHook(() => useUndoToast())
    const visibleRestore = vi.fn()
    const firstPendingRestore = vi.fn()
    const secondPendingRestore = vi.fn()
    act(() => {
      result.current('Visible undo', visibleRestore)
      result.current('First pending undo', firstPendingRestore)
      result.current('Second pending undo', secondPendingRestore)
    })

    expect(useAppToastStore.getState().queue.map((item) => item.toast.message)).toEqual([
      'First pending undo', 'Second pending undo',
    ])
    pressKey({ key: 'z', ctrlKey: true })
    expect(visibleRestore).toHaveBeenCalledOnce()
    expect(firstPendingRestore).not.toHaveBeenCalled()
    expect(secondPendingRestore).not.toHaveBeenCalled()
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('First pending undo')
    pressKey({ key: 'z', ctrlKey: true })
    expect(visibleRestore).toHaveBeenCalledOnce()
    expect(firstPendingRestore).toHaveBeenCalledOnce()
    expect(secondPendingRestore).not.toHaveBeenCalled()
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Second pending undo')
  })
})
