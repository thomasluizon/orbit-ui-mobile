import { create } from 'zustand'

interface ShellState {
  paletteOpen: boolean
  setPaletteOpen: (value: boolean) => void
  togglePalette: () => void
}

export const useShellStore = create<ShellState>()((set) => ({
  paletteOpen: false,
  setPaletteOpen: (value) => set({ paletteOpen: value }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
}))
