'use client'

import { useState, useEffect, useRef, useCallback, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface AppOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  titleContent?: ReactNode
  description?: string
  dismissible?: boolean
  expandable?: boolean
  children?: ReactNode
  footer?: ReactNode
  onExpandDescription?: () => void
}

export function AppOverlay({
  open,
  onOpenChange,
  title,
  titleContent,
  description,
  dismissible = true,
  expandable = false,
  children,
  footer,
  onExpandDescription,
}: AppOverlayProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDialogElement>(null)
  const pointerDownOnBackdrop = useRef(false)
  const savedScrollY = useRef(0)
  const previouslyFocusedElement = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const lockBodyScroll = useCallback(() => {
    savedScrollY.current = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY.current}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'contain'
  }, [])

  const unlockBodyScroll = useCallback(() => {
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
    document.documentElement.style.overscrollBehavior = ''
    window.scrollTo(0, savedScrollY.current)
  }, [])

  // Focus trap
  useEffect(() => {
    if (!open) return

    lockBodyScroll()
    previouslyFocusedElement.current = document.activeElement as HTMLElement

    const FOCUSABLE_SELECTORS = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    function getFocusableElements(): HTMLElement[] {
      if (!panelRef.current) return []
      return Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
        .filter((el) => !el.closest('[hidden]'))
    }

    // Auto-focus first focusable element
    requestAnimationFrame(() => {
      const focusable = getFocusableElements()
      if (focusable.length > 0) focusable[0]!.focus()
    })

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = getFocusableElements()
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) {
        onOpenChange(false)
      }
    }

    document.addEventListener('keydown', trapFocus)
    document.addEventListener('keydown', handleEscape)

    return () => {
      unlockBodyScroll()
      document.removeEventListener('keydown', trapFocus)
      document.removeEventListener('keydown', handleEscape)
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus()
        previouslyFocusedElement.current = null
      }
    }
  }, [open, dismissible, onOpenChange, lockBodyScroll, unlockBodyScroll])

  function handlePointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement
    pointerDownOnBackdrop.current = !panelRef.current?.contains(target)
  }

  function handleBackdropClick() {
    if (dismissible && pointerDownOnBackdrop.current) {
      onOpenChange(false)
    }
    pointerDownOnBackdrop.current = false
  }

  if (!open || !mounted) return null

  const hasTitle = !!(title || titleContent)

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4"
      onPointerDown={handlePointerDown}
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel - bottom sheet on mobile, centered modal on desktop */}
      <dialog
        ref={panelRef}
        open
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        className="relative w-full sm:max-w-lg max-h-[90dvh] bg-surface-overlay rounded-t-2xl sm:rounded-2xl border-t sm:border border-border overflow-clip flex flex-col shadow-[var(--shadow-lg)] overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-2 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border-emphasis" />
        </div>

        {/* Header */}
        {hasTitle && (
          <div className="flex items-start justify-between px-6 py-4">
            <div className="flex-1 min-w-0">
              <div
                id={titleId}
                className="font-extrabold text-[length:var(--text-fluid-2xl)] text-text-primary tracking-tight"
              >
                {titleContent || title}
              </div>
              {description && (
                <div className="mt-1 flex items-start gap-2">
                  <p
                    className="flex-1 text-sm text-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: description }}
                  />
                  {expandable && (
                    <button
                      className="shrink-0 size-7 rounded-full bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors mt-0.5"
                      aria-label="Expand description"
                      onClick={onExpandDescription}
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            {dismissible && (
              <button
                className="shrink-0 size-8 rounded-full bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors ml-4"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        {children && (
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(1rem+var(--safe-bottom))]">
            {children}
          </div>
        )}

        {/* Footer */}
        {footer && (
          <div className="px-6 pt-4 pb-[calc(1rem+var(--safe-bottom))] border-t border-border">
            {footer}
          </div>
        )}

        {/* Accessible live region for status announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only" />
      </dialog>
    </div>
  )

  return createPortal(overlay, document.body)
}
