'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Check, Trash2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useIsClient } from '@/hooks/use-is-client'
import {
  isTopOverlay,
  registerOverlay,
  unregisterOverlay,
} from '@/lib/overlay-stack'

type Variant = 'danger' | 'warning' | 'success' | 'info'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  /** 'danger' renders the confirm action as a status-bad fill pill (dlg-delete
   *  artboard). 'info' renders a single close action and hides the cancel button. */
  variant?: Variant
  /** Leading glyph on the confirm action. Overrides the per-variant default
   *  (trash for 'danger', check for 'success'/'warning', none for 'info'). */
  leadingIcon?: ReactNode
}

const pillBase =
  'flex-1 flex items-center justify-center gap-[6px] appearance-none border-0 cursor-pointer rounded-full transition-[background-color,transform,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96]'

const actionVariantClasses: Record<'destructive' | 'primary', string> = {
  destructive:
    'bg-[var(--status-bad)] hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,black)] hover:-translate-y-px active:translate-y-0',
  primary:
    'bg-[var(--primary)] hover:bg-[var(--primary-pressed)] hover:-translate-y-px active:translate-y-0',
}

function defaultConfirmIcon(variant: Variant): { key: string; node: ReactNode } | null {
  if (variant === 'danger') {
    return { key: 'trash', node: <Trash2 size={16} strokeWidth={2} aria-hidden="true" /> }
  }
  if (variant === 'success' || variant === 'warning') {
    return { key: 'check', node: <Check size={17} strokeWidth={2.4} aria-hidden="true" /> }
  }
  return null
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'danger',
  leadingIcon,
}: Readonly<ConfirmDialogProps>) {
  const t = useTranslations()
  const overlayId = useId()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedElement = useRef<HTMLElement | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('dialog', Boolean(prefersReducedMotion))
  const mounted = useIsClient()
  const destructive = variant === 'danger'
  const infoOnly = variant === 'info'
  const defaultIcon = defaultConfirmIcon(variant)
  const confirmIcon = leadingIcon ?? defaultIcon?.node

  useEffect(() => {
    if (!open) return

    previouslyFocusedElement.current = document.activeElement as HTMLElement

    registerOverlay({
      id: overlayId,
      dismiss: () => onOpenChange(false),
    })

    requestAnimationFrame(() => {
      if (!isTopOverlay(overlayId)) return
      panelRef.current?.querySelector<HTMLElement>('button')?.focus()
    })

    function handleKeydown(e: KeyboardEvent) {
      if (!isTopOverlay(overlayId)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
        return
      }
      if (e.key !== 'Tab') return
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable.at(-1)!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => {
      unregisterOverlay(overlayId)
      document.removeEventListener('keydown', handleKeydown)
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus()
        previouslyFocusedElement.current = null
      }
    }
  }, [open, overlayId, onOpenChange])

  function handleConfirm() {
    onConfirm?.()
    onOpenChange(false)
  }

  function handleCancel() {
    onCancel?.()
    onOpenChange(false)
  }

  if (!mounted) return null

  const dialog = (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ padding: 24 }}>
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label={t('common.close')}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
            onClick={() => {
              if (isTopOverlay(overlayId)) onOpenChange(false)
            }}
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

          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative w-full"
            style={{
              maxWidth: 340,
              borderRadius: 24,
              background: 'var(--bg-sheet)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.55), inset 0 0 0 1px var(--hairline)',
              padding: '24px 22px 18px',
            }}
            initial={{ opacity: 0, scale: motionPreset.scaleFrom, y: motionPreset.shift * 0.5 }}
            animate={{
              opacity: 1,
              scale: motionPreset.scaleTo,
              y: 0,
              transition: {
                duration: motionPreset.enterDuration / 1000,
                ease: motionPreset.enterEasing,
              },
            }}
            exit={{
              opacity: 0,
              scale: 0.97,
              y: motionPreset.shift * 0.25,
              transition: {
                duration: motionPreset.exitDuration / 1000,
                ease: motionPreset.exitEasing,
              },
            }}
          >
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 20,
                fontWeight: 500,
                lineHeight: 1.3,
                color: 'var(--fg-1)',
                textWrap: 'balance',
              }}
            >
              {title}
            </h2>
            <p
              id={descriptionId}
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                lineHeight: 1.5,
                color: 'var(--fg-2)',
                textWrap: 'pretty',
              }}
            >
              {description}
            </p>
            <div className="flex items-center" style={{ gap: 10, marginTop: 22 }}>
              {!infoOnly && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className={`${pillBase} bg-[color-mix(in_srgb,var(--fg-1)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--fg-1)_10%,transparent)]`}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--fg-1)',
                    padding: '13px 0',
                    minHeight: 44,
                  }}
                >
                  {cancelLabel || t('common.cancel')}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                data-variant={destructive ? 'destructive' : 'primary'}
                className={`${pillBase} ${actionVariantClasses[destructive ? 'destructive' : 'primary']}`}
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  fontWeight: 500,
                  color: destructive ? 'var(--fg-on-bad)' : 'var(--fg-on-primary)',
                  padding: '13px 0',
                  minHeight: 44,
                }}
              >
                {confirmIcon ? (
                  <span
                    aria-hidden="true"
                    data-confirm-icon={leadingIcon ? 'custom' : defaultIcon?.key}
                    className="inline-flex shrink-0"
                  >
                    {confirmIcon}
                  </span>
                ) : null}
                {confirmLabel || (infoOnly ? t('common.close') : t('common.confirm'))}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )

  return createPortal(dialog, document.body)
}
