'use client'

import { useEffect, useRef, useCallback, useId, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X, Expand } from 'lucide-react'
import { useTranslations } from 'next-intl'
import DOMPurify from 'dompurify'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import {
  isTopOverlay,
  registerOverlay,
  unregisterOverlay,
  type OverlayCloseReason,
} from '@/lib/overlay-stack'

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
  canDismiss?: boolean
  isDirty?: boolean
  expandable?: boolean
  children?: ReactNode
  footer?: ReactNode
  onExpandDescription?: () => void
  onAttemptDismiss?: (reason: OverlayCloseReason) => void
  initialFocusRef?: RefObject<HTMLElement | null>
}

let bodyScrollLockCount = 0
let lockedScrollY = 0

export function AppOverlay({
  open,
  onOpenChange,
  title,
  titleContent,
  description,
  dismissible = true,
  canDismiss = true,
  isDirty = false,
  expandable = false,
  children,
  footer,
  onExpandDescription,
  onAttemptDismiss,
  initialFocusRef,
}: Readonly<AppOverlayProps>) {
  const t = useTranslations()
  const overlayId = useId()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDialogElement>(null)
  const pointerDownOnBackdrop = useRef(false)
  const previouslyFocusedElement = useRef<HTMLElement | null>(null)
  const requestCloseRef = useRef<(reason: OverlayCloseReason) => void>(() => {})
  const [mounted, setMounted] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('dialog', Boolean(prefersReducedMotion))

  useEffect(() => {
    setMounted(true)
  }, [])

  const lockBodyScroll = useCallback(() => {
    if (bodyScrollLockCount === 0) {
      lockedScrollY = globalThis.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${lockedScrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      document.documentElement.style.overscrollBehavior = 'contain'
    }

    bodyScrollLockCount += 1
  }, [])

  const unlockBodyScroll = useCallback(() => {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)

    if (bodyScrollLockCount > 0) return

    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
    document.documentElement.style.overscrollBehavior = ''
    globalThis.scrollTo(0, lockedScrollY)
  }, [])

  const requestClose = useCallback(
    (reason: OverlayCloseReason) => {
      if (!dismissible) return

      if (!canDismiss || isDirty) {
        onAttemptDismiss?.(reason)
        return
      }

      onOpenChange(false)
    },
    [canDismiss, dismissible, isDirty, onAttemptDismiss, onOpenChange],
  )

  useEffect(() => {
    requestCloseRef.current = requestClose
  }, [requestClose])

  // Focus trap
  useEffect(() => {
    if (!open) return

    lockBodyScroll()
    previouslyFocusedElement.current = document.activeElement as HTMLElement
    registerOverlay({
      id: overlayId,
      dismiss: (reason) => {
        requestCloseRef.current(reason)
      },
    })

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
      if (!isTopOverlay(overlayId)) return
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      const focusable = getFocusableElements()
      if (focusable.length > 0) focusable[0]!.focus()
    })

    function trapFocus(e: KeyboardEvent) {
      if (!isTopOverlay(overlayId)) return
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
      if (e.key === 'Escape' && isTopOverlay(overlayId)) {
        e.preventDefault()
        e.stopPropagation()
        requestCloseRef.current('escape')
      }
    }

    document.addEventListener('keydown', trapFocus)
    document.addEventListener('keydown', handleEscape)

    return () => {
      unlockBodyScroll()
      unregisterOverlay(overlayId)
      document.removeEventListener('keydown', trapFocus)
      document.removeEventListener('keydown', handleEscape)
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus()
        previouslyFocusedElement.current = null
      }
    }
  }, [open, initialFocusRef, lockBodyScroll, overlayId, unlockBodyScroll])

  function handlePointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement
    pointerDownOnBackdrop.current = !panelRef.current?.contains(target)
  }

  function handleBackdropClick() {
    if (pointerDownOnBackdrop.current && isTopOverlay(overlayId)) {
      requestClose('backdrop')
    }
    pointerDownOnBackdrop.current = false
  }

  if (!mounted) return null

  const hasTitle = !!(title || titleContent)
  const linkedDescription = description ? linkifyText(description) : ''
  const bodyPaddingClass = footer
    ? 'px-6 pb-0'
    : 'px-6 pb-[calc(1rem+var(--safe-bottom))] sm:pb-4'

  const overlay = (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4"
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-md cursor-default"
            aria-label={t('common.close')}
            tabIndex={-1}
            onPointerDown={handlePointerDown}
            onClick={handleBackdropClick}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: {
                duration: motionPreset.enterDuration / 1000,
                ease: motionPreset.enterEasing,
              },
            }}
            exit={{
              opacity: 0,
              transition: {
                duration: motionPreset.exitDuration / 1000,
                ease: motionPreset.exitEasing,
              },
            }}
          />

          <motion.dialog
            ref={panelRef}
            open
            aria-modal="true"
            aria-labelledby={hasTitle ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            className="relative w-full sm:max-w-lg max-h-[90dvh] overflow-clip rounded-t-[var(--radius-2xl)] border-t border-border-muted bg-surface-overlay shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-2xl)] sm:border flex flex-col overscroll-contain [box-shadow:var(--shadow-lg),inset_0_1px_0_var(--surface-top-highlight)]"
            initial={{
              opacity: 0,
              y: motionPreset.shift,
              scale: motionPreset.scaleFrom,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: motionPreset.scaleTo,
              transition: {
                duration: motionPreset.enterDuration / 1000,
                ease: motionPreset.enterEasing,
              },
            }}
            exit={{
              opacity: 0,
              y: motionPreset.shift * 0.35,
              scale: 0.985,
              transition: {
                duration: motionPreset.exitDuration / 1000,
                ease: motionPreset.exitEasing,
              },
            }}
          >
            <div className="flex justify-center pt-3 pb-2 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-primary/20" />
            </div>

            {hasTitle && (
              <div className="flex items-start justify-between px-6 py-4">
                <div className="flex-1 min-w-0">
                  <h2
                    id={titleId}
                    className="font-extrabold text-[length:var(--text-fluid-2xl)] text-text-primary tracking-tight"
                  >
                    {titleContent || title}
                  </h2>
                  {description && (
                    <div className="mt-1 flex items-start gap-2">
                      <p
                        id={descriptionId}
                        className="flex-1 text-sm text-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: linkedDescription }}
                      />
                      {expandable && (
                        <button
                          className="shrink-0 size-8 rounded-full border border-border-muted bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-[background-color,border-color,color] duration-150 mt-0.5"
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
                    className="shrink-0 size-9 rounded-full border border-border-muted bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-[background-color,border-color,color,transform] duration-150 ml-4 active:scale-[var(--orbit-press-scale)]"
                    aria-label={t('common.close')}
                    onClick={() => requestClose('close-button')}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            )}

            {children && (
              <div
                data-slot="overlay-body"
                className={`flex-1 overflow-y-auto overscroll-contain ${bodyPaddingClass}`}
              >
                {children}
              </div>
            )}

            {footer && (
              <div
                data-slot="overlay-footer"
                className="px-6 pt-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-6 border-t border-border-muted bg-surface-overlay/80"
              >
                {footer}
              </div>
            )}
          </motion.dialog>
        </div>
      ) : null}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}
