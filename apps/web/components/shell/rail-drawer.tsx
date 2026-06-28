'use client'

import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { PanelRight } from 'lucide-react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useIsClient } from '@/hooks/use-is-client'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useShellStore } from '@/stores/shell-store'

interface RailDrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Right-side slide-in drawer that surfaces the contextual rail content behind a scrim
 * on the 768–1279 range, where the fixed `RightRail` (xl+) is not shown. The panel
 * slides on `transform` only and the scrim fades on `opacity`; reduced motion collapses
 * both to an instant cut. Dismissed by Escape (shared overlay stack) or a scrim click.
 * The caller gates `open` to home + below-xl so it never overlaps the fixed rail.
 */
export function RailDrawer({ open, onClose, children }: Readonly<RailDrawerProps>) {
  const t = useTranslations()
  const mounted = useIsClient()
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('sheet', Boolean(prefersReducedMotion))

  useOverlayEscape({ open, onDismiss: onClose })

  if (!mounted) return null

  const reduced = motionPreset.reducedMotionEnabled
  const closedX = reduced ? 0 : '100%'
  const enterTransition = {
    duration: reduced ? 0 : motionPreset.enterDuration / 1000,
    ease: motionPreset.enterEasing,
  }
  const exitTransition = {
    duration: reduced ? 0 : motionPreset.exitDuration / 1000,
    ease: motionPreset.exitEasing,
  }

  const overlay = (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[9990] flex justify-end xl:hidden">
          <motion.button
            type="button"
            aria-label={t('common.close')}
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: enterTransition }}
            exit={{ opacity: 0, transition: exitTransition }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('rail.todayProgress')}
            className="thin-scrollbar relative h-dvh overflow-y-auto"
            style={{
              width: 'var(--rail-w)',
              background: 'var(--bg-sheet)',
              boxShadow: 'inset 1px 0 0 var(--hairline), var(--shadow-3)',
              paddingTop: 'calc(var(--safe-top) + 22px)',
              paddingBottom: 'calc(var(--safe-bottom) + 22px)',
              paddingInline: 20,
            }}
            initial={{ x: closedX }}
            animate={{ x: 0, transition: enterTransition }}
            exit={{ x: closedX, transition: exitTransition }}
          >
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}

/**
 * Floating control (768–1279 only) that opens the rail drawer on home, where the fixed
 * `RightRail` is hidden. Sits top-right of the content area, clear of the logo-only
 * header; at xl+ it is removed so it never competes with the fixed rail.
 */
export function RailToggle() {
  const t = useTranslations()
  const railOpen = useShellStore((state) => state.railOpen)
  const toggleRail = useShellStore((state) => state.toggleRail)

  return (
    <div
      className="fixed right-4 z-30 hidden md:block xl:hidden"
      style={{ top: 'calc(var(--safe-top) + 16px)' }}
    >
      <button
        type="button"
        aria-label={railOpen ? t('shell.closeRail') : t('shell.openRail')}
        aria-haspopup="dialog"
        aria-expanded={railOpen}
        onClick={toggleRail}
        className="icon-btn icon-btn-well"
        style={{
          width: 44,
          height: 44,
          boxShadow: 'var(--shadow-2), inset 0 0 0 1.5px var(--hairline-strong)',
        }}
      >
        <PanelRight size={20} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  )
}
