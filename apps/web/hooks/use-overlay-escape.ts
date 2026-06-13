'use client'

import { useEffect, useId, useRef, type RefObject } from 'react'
import {
  isTopOverlay,
  registerOverlay,
  unregisterOverlay,
  type OverlayCloseReason,
} from '@/lib/overlay-stack'

interface UseOverlayEscapeOptions {
  open: boolean
  onDismiss: (reason: OverlayCloseReason) => void
  initialFocusRef?: RefObject<HTMLElement | null>
  restoreFocus?: boolean
}

/**
 * Registers a bespoke (non-AppOverlay) dismissable layer in the shared overlay
 * stack so Escape resolves the top-most layer LIFO, then moves focus into the
 * layer on open and restores it to the previously focused element on close.
 * Use for portal overlays that do not go through AppOverlay/ConfirmDialog.
 */
export function useOverlayEscape({
  open,
  onDismiss,
  initialFocusRef,
  restoreFocus = true,
}: UseOverlayEscapeOptions): void {
  const overlayId = useId()
  const onDismissRef = useRef(onDismiss)
  const previouslyFocusedElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!open) return

    if (restoreFocus) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement
    }

    registerOverlay({
      id: overlayId,
      dismiss: (reason) => onDismissRef.current(reason),
    })

    if (initialFocusRef) {
      requestAnimationFrame(() => {
        if (isTopOverlay(overlayId)) initialFocusRef.current?.focus()
      })
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (!isTopOverlay(overlayId)) return
      event.preventDefault()
      event.stopPropagation()
      onDismissRef.current('escape')
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      unregisterOverlay(overlayId)
      document.removeEventListener('keydown', handleEscape)
      if (restoreFocus && previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus()
        previouslyFocusedElement.current = null
      }
    }
  }, [open, overlayId, initialFocusRef, restoreFocus])
}
