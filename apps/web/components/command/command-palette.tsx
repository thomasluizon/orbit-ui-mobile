'use client'

import {
  useCallback,
  useRef,
  type ComponentType,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import type { ShellDestinationId } from '@orbit/shared/utils'
import type { IconProps } from '@/components/ui/icons'
import { useIsClient } from '@/hooks/use-is-client'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useShellStore } from '@/stores/shell-store'
import { useModalFocusTrap } from '@/components/shell/use-modal-focus-trap'
import { CommandMenu } from './command-menu'

export interface CommandNavigationItem {
  id: ShellDestinationId
  label: string
  icon: ComponentType<IconProps>
  onSelect: () => void
}

interface CommandPaletteProps {
  navItems: readonly CommandNavigationItem[]
  onCreateHabit: () => void
}

interface CommandPaletteBackgroundProps {
  children: ReactNode
  className?: string
}

export function CommandPaletteBackground({
  children,
  className,
}: Readonly<CommandPaletteBackgroundProps>) {
  const paletteOpen = useShellStore((state) => state.paletteOpen)

  return (
    <div
      data-command-palette-background=""
      inert={paletteOpen || undefined}
      aria-hidden={paletteOpen || undefined}
      className={className}
    >
      {children}
    </div>
  )
}

/**
 * Global command palette (Cmd/Ctrl+K). A token-styled portal overlay wrapping the
 * cmdk menu, dismissed through the shared overlay/escape stack, which also traps
 * Tab inside the panel and restores focus on close. Mounted app-wide, but the
 * menu (and its habit query) only mount while `shell-store.paletteOpen`.
 */
export function CommandPalette({ navItems, onCreateHabit }: Readonly<CommandPaletteProps>) {
  const t = useTranslations()
  const paletteOpen = useShellStore((state) => state.paletteOpen)
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  const mounted = useIsClient()
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen])

  useOverlayEscape({ open: paletteOpen, onDismiss: close, restoreFocus: false })
  useModalFocusTrap(paletteOpen, panelRef)

  if (!mounted) return null

  const overlay = paletteOpen ? (
    <div className="z-modal fixed inset-0 flex items-start justify-center px-4 pt-24">
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[var(--scrim)]"
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('command.title')}
        className="relative w-full max-w-[560px] overflow-hidden rounded-[var(--r-card)] bg-[var(--bg-elev)] shadow-[inset_0_0_0_1px_var(--hairline),var(--sh-3)]"
      >
        <CommandMenu
          navItems={navItems}
          onCreateHabit={onCreateHabit}
          onClose={close}
        />
      </div>
    </div>
  ) : null

  // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- reached only after the useIsClient mounted gate returns null on the server; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  return createPortal(overlay, document.body)
}
