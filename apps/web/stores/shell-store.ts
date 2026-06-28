import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface ShellState {
  sidebarCollapsed: boolean
  railOpen: boolean
  paletteOpen: boolean
  astraOpen: boolean
  activeSettingsPanel: string | null
  toggleSidebar: () => void
  setSidebarCollapsed: (value: boolean) => void
  setRailOpen: (value: boolean) => void
  toggleRail: () => void
  setPaletteOpen: (value: boolean) => void
  togglePalette: () => void
  setAstraOpen: (value: boolean) => void
  toggleAstra: () => void
  setActiveSettingsPanel: (panel: string | null) => void
}

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

/**
 * Web-only desktop shell state: sidebar collapse, right-rail visibility (the
 * 768–1279 toggle), command-palette open, the docked Astra copilot, and the active
 * two-pane settings panel. Kept out of the shared cross-platform UI store since
 * mobile has no desktop shell. Only `sidebarCollapsed` persists (`astraOpen` is
 * deliberately ephemeral); rehydrated manually in `lib/providers.tsx`.
 */
export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      railOpen: false,
      paletteOpen: false,
      astraOpen: false,
      activeSettingsPanel: null,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setRailOpen: (value) => set({ railOpen: value }),
      toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
      setPaletteOpen: (value) => set({ paletteOpen: value }),
      togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
      setAstraOpen: (value) => set({ astraOpen: value }),
      toggleAstra: () => set((state) => ({ astraOpen: !state.astraOpen })),
      setActiveSettingsPanel: (panel) => set({ activeSettingsPanel: panel }),
    }),
    {
      name: 'orbit-shell-store',
      version: 1,
      storage: createJSONStorage<Pick<ShellState, 'sidebarCollapsed'>>(() =>
        globalThis.localStorage === undefined ? noopStorage : globalThis.localStorage,
      ),
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
      skipHydration: true,
    },
  ),
)
