import type { registerOverlay, unregisterOverlay } from '@/lib/overlay-stack'

type OverlayCloseReason =
  | 'backdrop'
  | 'close-button'
  | 'navigation'
  | 'system-back'

export interface BottomSheetOverlayState {
  isPresented: boolean
  isRegistered: boolean
}

export function createBottomSheetOverlayState(): BottomSheetOverlayState {
  return {
    isPresented: false,
    isRegistered: false,
  }
}

export function requestBottomSheetClose(
  state: BottomSheetOverlayState,
  options: {
    canDismiss: boolean
    dismissSheet: () => void
    isDirty: boolean
    onAttemptDismiss?: (reason: OverlayCloseReason) => void
    reason: OverlayCloseReason
  },
): boolean {
  if (!state.isPresented) {
    return false
  }

  if (!options.canDismiss || options.isDirty) {
    options.onAttemptDismiss?.(options.reason)
    return true
  }

  options.dismissSheet()
  return true
}

export function syncBottomSheetOverlayRegistration(
  state: BottomSheetOverlayState,
  options: {
    isPresented: boolean
    overlayId: string
    register: typeof registerOverlay
    requestClose: (reason: OverlayCloseReason) => boolean
    unregister: typeof unregisterOverlay
  },
): void {
  state.isPresented = options.isPresented

  if (options.isPresented) {
    if (state.isRegistered) {
      return
    }

    options.register({
      id: options.overlayId,
      dismiss: options.requestClose,
    })
    state.isRegistered = true
    return
  }

  if (!state.isRegistered) {
    return
  }

  options.unregister(options.overlayId)
  state.isRegistered = false
}

export function teardownBottomSheetOverlay(
  state: BottomSheetOverlayState,
  options: {
    overlayId: string
    unregister: typeof unregisterOverlay
  },
): void {
  state.isPresented = false

  if (!state.isRegistered) {
    return
  }

  options.unregister(options.overlayId)
  state.isRegistered = false
}
