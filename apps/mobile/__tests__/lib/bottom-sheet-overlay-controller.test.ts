import { describe, expect, it, vi } from 'vitest'
import {
  createBottomSheetOverlayState,
  requestBottomSheetClose,
  syncBottomSheetOverlayRegistration,
  teardownBottomSheetOverlay,
} from '@/lib/bottom-sheet-overlay-controller'

describe('mobile bottom sheet overlay controller', () => {
  it('does not claim dismissal before the sheet is presented', () => {
    const state = createBottomSheetOverlayState()
    const dismissSheet = vi.fn()
    const onAttemptDismiss = vi.fn()

    expect(
      requestBottomSheetClose(state, {
        canDismiss: true,
        dismissSheet,
        isDirty: false,
        onAttemptDismiss,
        reason: 'navigation',
      }),
    ).toBe(false)
    expect(dismissSheet).not.toHaveBeenCalled()
    expect(onAttemptDismiss).not.toHaveBeenCalled()
  })

  it('dismisses visible sheets when they can close', () => {
    const state = createBottomSheetOverlayState()
    state.isPresented = true
    const dismissSheet = vi.fn()

    expect(
      requestBottomSheetClose(state, {
        canDismiss: true,
        dismissSheet,
        isDirty: false,
        reason: 'system-back',
      }),
    ).toBe(true)
    expect(dismissSheet).toHaveBeenCalledTimes(1)
  })

  it('keeps visible non-dismissible sheets open while surfacing the attempt', () => {
    const state = createBottomSheetOverlayState()
    state.isPresented = true
    const dismissSheet = vi.fn()
    const onAttemptDismiss = vi.fn()

    expect(
      requestBottomSheetClose(state, {
        canDismiss: false,
        dismissSheet,
        isDirty: false,
        onAttemptDismiss,
        reason: 'system-back',
      }),
    ).toBe(true)
    expect(dismissSheet).not.toHaveBeenCalled()
    expect(onAttemptDismiss).toHaveBeenCalledWith('system-back')
  })

  it('registers overlays only after presentation and removes them on close', () => {
    const state = createBottomSheetOverlayState()
    const register = vi.fn()
    const unregister = vi.fn()
    const requestClose = vi.fn(() => true)

    syncBottomSheetOverlayRegistration(state, {
      isPresented: false,
      overlayId: 'sheet-1',
      register,
      requestClose,
      unregister,
    })

    expect(register).not.toHaveBeenCalled()
    expect(unregister).not.toHaveBeenCalled()

    syncBottomSheetOverlayRegistration(state, {
      isPresented: true,
      overlayId: 'sheet-1',
      register,
      requestClose,
      unregister,
    })

    expect(register).toHaveBeenCalledTimes(1)
    expect(state.isRegistered).toBe(true)

    syncBottomSheetOverlayRegistration(state, {
      isPresented: true,
      overlayId: 'sheet-1',
      register,
      requestClose,
      unregister,
    })

    expect(register).toHaveBeenCalledTimes(1)

    syncBottomSheetOverlayRegistration(state, {
      isPresented: false,
      overlayId: 'sheet-1',
      register,
      requestClose,
      unregister,
    })

    expect(unregister).toHaveBeenCalledTimes(1)
    expect(state.isRegistered).toBe(false)
  })

  it('tears down registered overlays during dismiss and unmount cleanup', () => {
    const state = createBottomSheetOverlayState()
    state.isPresented = true
    state.isRegistered = true
    const unregister = vi.fn()

    teardownBottomSheetOverlay(state, {
      overlayId: 'sheet-2',
      unregister,
    })

    expect(unregister).toHaveBeenCalledWith('sheet-2')
    expect(state.isPresented).toBe(false)
    expect(state.isRegistered).toBe(false)
  })
})
