import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePopoverMenu } from '@/hooks/use-popover-menu'

describe('usePopoverMenu', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts closed with default position', () => {
    const { result } = renderHook(() => usePopoverMenu())

    expect(result.current.isOpen).toBe(false)
    expect(result.current.position).toEqual({ top: 0, left: 0 })
  })

  it('opens and closes', () => {
    const { result } = renderHook(() => usePopoverMenu())

    act(() => {
      result.current.open()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('toggles open and closed', () => {
    const { result } = renderHook(() => usePopoverMenu())

    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('closes on Escape key', () => {
    const { result } = renderHook(() => usePopoverMenu())

    act(() => {
      result.current.open()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('closes on scroll', () => {
    const { result } = renderHook(() => usePopoverMenu())

    act(() => {
      result.current.open()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('closes on resize', () => {
    const { result } = renderHook(() => usePopoverMenu())

    act(() => {
      result.current.open()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('closes on pointerdown outside', () => {
    const { result } = renderHook(() => usePopoverMenu())

    act(() => {
      result.current.open()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('does not register listeners when closed', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')

    const { result } = renderHook(() => usePopoverMenu())

    // When closed, should not add pointerdown/keydown listeners
    // (scroll/resize are on window)
    const pointerdownCalls = addSpy.mock.calls.filter(
      (call) => call[0] === 'pointerdown',
    )
    expect(pointerdownCalls).toHaveLength(0)

    addSpy.mockRestore()
  })

  it('provides triggerRef and panelRef', () => {
    const { result } = renderHook(() => usePopoverMenu())

    expect(result.current.triggerRef).toBeDefined()
    expect(result.current.panelRef).toBeDefined()
    expect(result.current.triggerRef.current).toBeNull()
    expect(result.current.panelRef.current).toBeNull()
  })

  it('accepts custom placement option', () => {
    const { result } = renderHook(() =>
      usePopoverMenu({ placement: 'bottom-end', offset: 16, margin: 20 }),
    )

    expect(result.current.isOpen).toBe(false)
    // The hook should initialize without error
  })
})
