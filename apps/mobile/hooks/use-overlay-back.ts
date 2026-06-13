import { useEffect, useId, useRef } from 'react'
import { registerOverlay, unregisterOverlay } from '@/lib/overlay-stack'

/**
 * Registers a non-Modal blocking layer (tour, level-up) in the shared overlay
 * stack while it is active, so the root hardware-back handler dismisses the
 * top-most layer LIFO and returns true instead of falling through to
 * navigation. Surfaces backed by a RN Modal use onRequestClose instead.
 */
export function useOverlayBack(active: boolean, onDismiss: () => void): void {
  const overlayId = useId()
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!active) return

    registerOverlay({
      id: overlayId,
      dismiss: () => {
        onDismissRef.current()
        return true
      },
    })

    return () => unregisterOverlay(overlayId)
  }, [active, overlayId])
}
