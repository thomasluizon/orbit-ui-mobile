'use client'

import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useAppToast } from '@/hooks/use-app-toast'
import type { ShellDestinationId } from '@orbit/shared/utils'
import type { IconProps } from '@/components/ui/icons'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'

function createCommandPaletteDialog() {
  return dynamic<CommandPaletteProps & { modalId: string; panelRef: RefObject<HTMLDivElement | null>; onLoadFailure: () => void }>(
    () => import('./command-palette-dialog')
      .then((module) => module.CommandPaletteDialog)
      .catch(() => {
        CommandPaletteDialog = createCommandPaletteDialog()
        return CommandPaletteLoadFailure
      }),
    { ssr: false, loading: () => null },
  )
}

let CommandPaletteDialog = createCommandPaletteDialog()

function CommandPaletteLoadFailure({ onLoadFailure }: Readonly<{ onLoadFailure: () => void }>) {
  useEffect(onLoadFailure, [onLoadFailure])
  return null
}

export interface CommandNavigationItem {
  id: ShellDestinationId
  label: string
  icon: ComponentType<IconProps>
  onSelect: () => void
}

export interface CommandPaletteProps {
  navItems: readonly CommandNavigationItem[]
  onCreateHabit: () => void
}

interface CommandPaletteBackgroundProps {
  children: ReactNode
  className?: string
}

export const CommandPalettePortalContext = createContext<
  (portal: HTMLDivElement | null) => void
>(() => {})

export function CommandPaletteBackground({
  children,
  className,
}: Readonly<CommandPaletteBackgroundProps>) {
  const [portalMounted, setPortalMounted] = useState(false)
  const registerPortal = useCallback(
    (portal: HTMLDivElement | null) => setPortalMounted(portal !== null),
    [],
  )

  return (
    <CommandPalettePortalContext value={registerPortal}>
      <div
        data-command-palette-background=""
        inert={portalMounted || undefined}
        aria-hidden={portalMounted || undefined}
        className={className}
      >
        {children}
      </div>
    </CommandPalettePortalContext>
  )
}

export function CommandPalette(props: Readonly<CommandPaletteProps>) {
  const t = useTranslations()
  const { showError, dismissToast } = useAppToast()
  const failureToastId = useRef<number | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const paletteOpen = useShellStore((state) => state.paletteOpen)
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  const modalId = `modal:${useId()}`
  const handleLoadFailure = useCallback(() => {
    setPaletteOpen(false)
    failureToastId.current = showError(t('command.loadFailed'))
  }, [setPaletteOpen, showError, t])
  useEffect(() => () => {
    setPaletteOpen(false)
    if (failureToastId.current !== undefined) dismissToast(failureToastId.current)
  }, [dismissToast, setPaletteOpen])
  useEffect(() => {
    if (!paletteOpen) return
    if (failureToastId.current !== undefined) {
      dismissToast(failureToastId.current)
      failureToastId.current = undefined
    }
    const { registerOpenOverlay, unregisterOpenOverlay } = useUIStore.getState()
    registerOpenOverlay(modalId)
    const unsubscribe = useUIStore.subscribe(({ openOverlayIds }) => {
      if (!panelRef.current && openOverlayIds.at(-1) !== modalId) setPaletteOpen(false)
    })
    return () => {
      unsubscribe()
      unregisterOpenOverlay(modalId)
    }
  }, [dismissToast, modalId, paletteOpen, setPaletteOpen])
  useOverlayEscape({ open: paletteOpen, onDismiss: () => setPaletteOpen(false), restoreFocus: false })
  return paletteOpen ? <CommandPaletteDialog {...props} modalId={modalId} panelRef={panelRef} onLoadFailure={handleLoadFailure} /> : null
}
