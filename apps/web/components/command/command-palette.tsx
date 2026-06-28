'use client'

import { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { resolveMotionPreset } from '@orbit/shared/theme'
import type { SidebarNavItem } from '@/components/navigation/app-sidebar'
import { useIsClient } from '@/hooks/use-is-client'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useShellStore } from '@/stores/shell-store'
import { CommandMenu } from './command-menu'

interface CommandPaletteProps {
  navItems: readonly SidebarNavItem[]
  onCreateHabit: () => void
  onCreateGoal: () => void
}

/**
 * Global command palette (Cmd/Ctrl+K). A token-styled portal overlay wrapping the
 * cmdk menu, dismissed through the shared overlay/escape stack. Mounted app-wide,
 * but the menu (and its habit query) only mount while `shell-store.paletteOpen`.
 */
export function CommandPalette({ navItems, onCreateHabit, onCreateGoal }: Readonly<CommandPaletteProps>) {
  const t = useTranslations()
  const paletteOpen = useShellStore((state) => state.paletteOpen)
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  const mounted = useIsClient()
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('dialog', Boolean(prefersReducedMotion))

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen])

  useOverlayEscape({ open: paletteOpen, onDismiss: close })

  if (!mounted) return null

  const overlay = (
    <AnimatePresence>
      {paletteOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[12vh]">
          <motion.button
            type="button"
            aria-label={t('common.close')}
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-black/55"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: motionPreset.enterDuration / 1000, ease: motionPreset.enterEasing },
            }}
            exit={{
              opacity: 0,
              transition: { duration: motionPreset.exitDuration / 1000, ease: motionPreset.exitEasing },
            }}
            onClick={close}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('command.placeholder')}
            className="relative w-full max-w-[600px] overflow-hidden rounded-[var(--radius-xl)] bg-[var(--bg-sheet)] shadow-[inset_0_0_0_1px_var(--hairline),var(--shadow-3)]"
            initial={{ opacity: 0, y: motionPreset.shift, scale: motionPreset.scaleFrom }}
            animate={{
              opacity: 1,
              y: 0,
              scale: motionPreset.scaleTo,
              transition: { duration: motionPreset.enterDuration / 1000, ease: motionPreset.enterEasing },
            }}
            exit={{
              opacity: 0,
              y: motionPreset.shift * 0.35,
              scale: 0.985,
              transition: { duration: motionPreset.exitDuration / 1000, ease: motionPreset.exitEasing },
            }}
          >
            <CommandMenu
              navItems={navItems}
              onCreateHabit={onCreateHabit}
              onCreateGoal={onCreateGoal}
              onClose={close}
            />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}
