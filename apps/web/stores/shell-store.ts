import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getPersistStorage } from '@/lib/persist-storage'

interface ShellState {
  sidebarCollapsed: boolean
  railOpen: boolean
  paletteOpen: boolean
  astraOpen: boolean
  astraMaximized: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (value: boolean) => void
  setRailOpen: (value: boolean) => void
  toggleRail: () => void
  setPaletteOpen: (value: boolean) => void
  togglePalette: () => void
  setAstraOpen: (value: boolean) => void
  toggleAstra: () => void
  setAstraMaximized: (value: boolean) => void
  toggleAstraMaximized: () => void
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      railOpen: false,
      paletteOpen: false,
      astraOpen: false,
      astraMaximized: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setRailOpen: (value) => set({ railOpen: value }),
      toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
      setPaletteOpen: (value) => set({ paletteOpen: value }),
      togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
      setAstraOpen: (value) =>
        set((state) => ({ astraOpen: value, astraMaximized: value ? state.astraMaximized : false })),
      toggleAstra: () => set((state) => ({ astraOpen: !state.astraOpen })),
      setAstraMaximized: (value) => set({ astraMaximized: value }),
      toggleAstraMaximized: () => set((state) => ({ astraMaximized: !state.astraMaximized })),
    }),
    {
      name: 'orbit-shell-store',
      version: 1,
      storage: createJSONStorage<Pick<ShellState, 'sidebarCollapsed'>>(getPersistStorage),
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
      skipHydration: true,
    },
  ),
)
