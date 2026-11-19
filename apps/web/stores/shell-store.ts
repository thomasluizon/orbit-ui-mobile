import { create } from 'zustand'
import type { ShellDestinationId } from '@orbit/shared/utils'
import { readSidebarCollapsedCookie, writeSidebarCollapsedCookie } from '@/lib/sidebar-preference'

interface ShellState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  lastDestination: ShellDestinationId
  setLastDestination: (destination: ShellDestinationId) => void
  paletteOpen: boolean
  setPaletteOpen: (value: boolean) => void
  togglePalette: () => void
}

export const useShellStore = create<ShellState>()((set, get): ShellState => ({
  sidebarCollapsed: readSidebarCollapsedCookie(),
  toggleSidebar: () => {
    const sidebarCollapsed = !get().sidebarCollapsed
    writeSidebarCollapsedCookie(sidebarCollapsed)
    set({ sidebarCollapsed })
  },
  lastDestination: 'hoje',
  setLastDestination: (lastDestination) => set({ lastDestination }),
  paletteOpen: false,
  setPaletteOpen: (value) => set({ paletteOpen: value }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
}))
