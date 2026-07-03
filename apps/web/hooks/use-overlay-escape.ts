'use client'

import { useEffect, useId, useRef, type RefObject } from 'react'
import { trapTabKey } from '@/lib/focus-trap'
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
  /** When provided, Tab/Shift+Tab cycle inside this element while the layer is top-most. */
  panelRef?: RefObject<HTMLElement | null>
  restoreFocus?: boolean
}

/**
 * Registers a bespoke (non-AppOverlay) dismissable layer in the shared overlay
 * stack so Escape resolves the top-most layer LIFO, then moves focus into the
 * layer on open, optionally traps Tab within `panelRef`, and restores focus to
 * the previously focused element on close. Use for portal overlays that do not
 * go through AppOverlay/ConfirmDialog.
 */
export function useOverlayEscape({
  open,
  onDismiss,
  initialFocusRef,
  panelRef,
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

    function handleTab(event: KeyboardEvent) {
      if (!isTopOverlay(overlayId)) return
      trapTabKey(event, panelRef?.current ?? null)
    }

    document.addEventListener('keydown', handleEscape)
    if (panelRef) document.addEventListener('keydown', handleTab)

    return () => {
      unregisterOverlay(overlayId)
      document.removeEventListener('keydown', handleEscape)
      if (panelRef) document.removeEventListener('keydown', handleTab)
      if (restoreFocus && previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus()
        previouslyFocusedElement.current = null
      }
    }
  }, [open, overlayId, initialFocusRef, panelRef, restoreFocus])
}
