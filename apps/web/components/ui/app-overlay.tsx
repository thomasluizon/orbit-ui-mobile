'use client'

import { useState, useEffect, useRef, useCallback, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Expand } from 'lucide-react'
import { useTranslations } from 'next-intl'
import DOMPurify from 'dompurify'

// ---------------------------------------------------------------------------
// linkifyText -- converts URLs in plain text to clickable <a> tags
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function linkifyText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g
  const parts = text.split(urlRegex)

  const result = parts.map((part, i) => {
    const escaped = escapeHtml(part)
    if (i % 2 === 1) {
      return `<a href="${escaped}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${escaped}</a>`
    }
    return escaped
  }).join('')

  return DOMPurify.sanitize(result, { ALLOWED_TAGS: ['a'], ALLOWED_ATTR: ['href', 'target', 'rel', 'class'] })
}

// ---------------------------------------------------------------------------
// AppOverlay
// ---------------------------------------------------------------------------

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
}: Readonly<AppOverlayProps>) {
  const t = useTranslations()
  const titleId = useId()
  const panelRef = useRef<HTMLDialogElement>(null)
  const pointerDownOnBackdrop = useRef(false)
  const savedScrollY = useRef(0)
  const previouslyFocusedElement = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [animState, setAnimState] = useState<'hidden' | 'entering' | 'visible' | 'leaving'>('hidden')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Transition state machine
  useEffect(() => {
    if (open && mounted) {
      setAnimState('entering')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimState('visible')
        })
      })
    } else if (!open && animState === 'visible') {
      setAnimState('leaving')
      const timer = setTimeout(() => setAnimState('hidden'), 200)
      return () => clearTimeout(timer)
    }
  }, [open, mounted]) // eslint-disable-line react-hooks/exhaustive-deps

  const lockBodyScroll = useCallback(() => {
    savedScrollY.current = globalThis.scrollY
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
    globalThis.scrollTo(0, savedScrollY.current)
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
      const last = focusable.at(-1)!
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

  if (animState === 'hidden' || !mounted) return null

  const hasTitle = !!(title || titleContent)
  const linkedDescription = description ? linkifyText(description) : ''

  // Transition classes
  const isEntering = animState === 'entering'
  const isLeaving = animState === 'leaving'
  const backdropClass = isEntering || isLeaving ? 'opacity-0' : 'opacity-100'
  let panelClass = 'translate-y-0 sm:scale-100 opacity-100'
  if (isEntering) panelClass = 'translate-y-full sm:translate-y-0 sm:scale-95 opacity-0'
  else if (isLeaving) panelClass = 'opacity-0'

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4"
    >
      {/* Backdrop dismiss button -- covers the full overlay area behind the panel */}
      <button
        type="button"
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-[var(--ease-out)] cursor-default ${backdropClass}`}
        aria-label="Close"
        tabIndex={-1}
        onPointerDown={handlePointerDown}
        onClick={handleBackdropClick}
      />

      {/* Panel - bottom sheet on mobile, centered modal on desktop */}
      <dialog
        ref={panelRef}
        open
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        className={`relative w-full sm:max-w-lg max-h-[90dvh] bg-surface-overlay rounded-t-2xl sm:rounded-2xl border-t sm:border border-border overflow-clip flex flex-col shadow-[var(--shadow-lg)] overscroll-contain transition-all duration-300 ease-[var(--ease-out)] ${panelClass}`}
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
                    dangerouslySetInnerHTML={{ __html: linkedDescription }}
                  />
                  {expandable && (
                    <button
                      className="shrink-0 size-7 rounded-full bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors mt-0.5"
                      aria-label={t('common.expandDescription')}
                      onClick={onExpandDescription}
                    >
                      <Expand className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {dismissible && (
              <button
                className="shrink-0 size-8 rounded-full bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors ml-4"
                aria-label={t('common.close')}
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
