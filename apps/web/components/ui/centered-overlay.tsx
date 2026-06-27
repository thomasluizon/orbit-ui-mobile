'use client'

import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'

interface CenteredOverlayProps {
  open: boolean
  onDismiss: () => void
  /** Id of the visible element that names the dialog. Takes precedence over ariaLabel. */
  ariaLabelledBy?: string
  /** Accessible name used when no visible labelling element exists. */
  ariaLabel?: string
  /** Panel chrome classes (sizing, padding, radius, background). */
  panelClassName?: string
  children: ReactNode
}

/** Full-viewport modal scaffold for compact centered dialogs (pickers, emoji
 *  grid). Portals to document.body so the dimming backdrop covers the whole
 *  screen rather than the centered app-shell column, then centers a dialog
 *  panel above it. Owns backdrop-dismiss, Escape (top-of-stack), and focus
 *  restore; callers own the panel content and any initial focus. */
export function CenteredOverlay({
  open,
  onDismiss,
  ariaLabelledBy,
  ariaLabel,
  panelClassName,
  children,
}: Readonly<CenteredOverlayProps>) {
  const t = useTranslations()
  const mounted = useIsClient()

  useOverlayEscape({ open, onDismiss })

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('common.close')}
        className="absolute inset-0 cursor-default bg-black/55"
        onClick={onDismiss}
      />
      <dialog
        open
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={`relative m-0 ${panelClassName ?? ''}`}
      >
        {children}
      </dialog>
    </div>,
    document.body,
  )
}
