'use client'

import { useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  useReducedMotion,
} from 'motion/react'
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
 * cmdk menu, dismissed through the shared overlay/escape stack, which also traps
 * Tab inside the panel and restores focus on close. Mounted app-wide, but the
 * menu (and its habit query) only mount while `shell-store.paletteOpen`.
 */
export function CommandPalette({ navItems, onCreateHabit, onCreateGoal }: Readonly<CommandPaletteProps>) {
  const t = useTranslations()
  const paletteOpen = useShellStore((state) => state.paletteOpen)
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  const mounted = useIsClient()
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('dialog', Boolean(prefersReducedMotion))
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen])

  useOverlayEscape({ open: paletteOpen, onDismiss: close, initialFocusRef: inputRef, panelRef })

  if (!mounted) return null

  const overlay = (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {paletteOpen ? (
          <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[12vh]">
            <m.button
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
            <m.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={t('command.title')}
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
                inputRef={inputRef}
              />
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  )

  // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- reached only after the useIsClient mounted gate returns null on the server; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  return createPortal(overlay, document.body)
}
