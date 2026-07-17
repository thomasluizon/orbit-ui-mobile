'use client'

import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* across components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
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
 *  panel above it, entering and exiting with the shared dialog motion preset.
 *  Owns backdrop-dismiss, Escape (top-of-stack), and focus restore; callers
 *  own the panel content and any initial focus. */
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
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('dialog', Boolean(prefersReducedMotion))

  useOverlayEscape({ open, onDismiss })

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label={t('common.close')}
            className="absolute inset-0 cursor-default bg-black/55"
            onClick={onDismiss}
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
            open
            aria-modal="true"
            aria-label={ariaLabelledBy ? undefined : ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className={`relative m-0 ${panelClassName ?? ''}`}
            initial={{
              opacity: 0,
              scale: motionPreset.scaleFrom,
              y: motionPreset.shift * 0.5,
            }}
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
            {children}
          </motion.dialog>
        </div>
      ) : null}
    </AnimatePresence>,
    // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- unreachable during SSR: the `if (!mounted) return null` above (useIsClient) returns before this createPortal on the server and first hydration render https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    document.body,
  )
}
