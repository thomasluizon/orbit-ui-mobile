'use client'

import { useEffect, useId, useRef, useSyncExternalStore, type RefObject } from 'react'
import {
  isTopModalFocusOwner,
  registerModalFocusOwner,
  subscribeToModalFocusOwners,
  unregisterModalFocusOwner,
} from '@/lib/overlay-stack'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hidden,
  )
}

export function useModalFocusTrap(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
): void {
  const ownerId = useId()
  const returnTargetRef = useRef<HTMLElement | null>(null)
  const ownsFocus = useSyncExternalStore(
    subscribeToModalFocusOwners,
    () => isTopModalFocusOwner(ownerId),
    () => false,
  )

  useEffect(() => {
    if (!open) return
    registerModalFocusOwner(ownerId)
    return () => unregisterModalFocusOwner(ownerId)
  }, [open, ownerId])

  useEffect(() => {
    if (!open || !ownsFocus) return
    const dialog = dialogRef.current
    if (!dialog) return

    const focusFirst = () => {
      const firstFocusable = getFocusableElements(dialog)[0]
      ;(firstFocusable ?? dialog).focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModalFocusOwner(ownerId)) return
      if (event.key !== 'Tab') return
      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopModalFocusOwner(ownerId)) return
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst()
    }

    focusFirst()
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [dialogRef, open, ownerId, ownsFocus])

  useEffect(() => {
    if (!open) return
    returnTargetRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    return () => {
      const returnTarget = returnTargetRef.current
      returnTargetRef.current = null
      if (returnTarget?.isConnected) returnTarget.focus()
    }
  }, [open])
}
