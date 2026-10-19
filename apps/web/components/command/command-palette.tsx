'use client'

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import dynamic from 'next/dynamic'
import type { ShellDestinationId } from '@orbit/shared/utils'
import type { IconProps } from '@/components/ui/icons'
import { useShellStore } from '@/stores/shell-store'

const CommandPaletteDialog = dynamic(
  () => import('./command-palette-dialog').then((module) => module.CommandPaletteDialog),
  { ssr: false, loading: () => null },
)

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
  const paletteOpen = useShellStore((state) => state.paletteOpen)
  const setPaletteOpen = useShellStore((state) => state.setPaletteOpen)
  useEffect(() => () => setPaletteOpen(false), [setPaletteOpen])
  return paletteOpen ? <CommandPaletteDialog {...props} /> : null
}
