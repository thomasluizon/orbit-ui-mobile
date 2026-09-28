import { create } from 'zustand'
import type { ShellDestinationId } from '@orbit/shared/utils'

interface ShellState {
  lastDestination: ShellDestinationId
  setLastDestination: (destination: ShellDestinationId) => void
  paletteOpen: boolean
  setPaletteOpen: (value: boolean) => void
  togglePalette: () => void
}

export const useShellStore = create<ShellState>()((set) => ({
  lastDestination: 'hoje',
  setLastDestination: (lastDestination) => set({ lastDestination }),
  paletteOpen: false,
  setPaletteOpen: (value) => set({ paletteOpen: value }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
}))
