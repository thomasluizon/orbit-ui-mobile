import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { captureException } from '@sentry/nextjs'
import type { ShellDestinationId } from '@orbit/shared/utils'
import { getPersistStorage } from '@/lib/persist-storage'

interface ShellState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  lastDestination: ShellDestinationId
  setLastDestination: (destination: ShellDestinationId) => void
  paletteOpen: boolean
  setPaletteOpen: (value: boolean) => void
  togglePalette: () => void
}

const sidebarStorage: StateStorage = {
  getItem: (name) => {
    try {
      return getPersistStorage().getItem(name)
    } catch (error) {
      captureException(error)
      return null
    }
  },
  setItem: (name, value) => {
    try {
      return getPersistStorage().setItem(name, value)
    } catch (error) {
      captureException(error)
    }
  },
  removeItem: (name) => {
    try {
      return getPersistStorage().removeItem(name)
    } catch (error) {
      captureException(error)
    }
  },
}

export const useShellStore = create<ShellState>()(persist((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  lastDestination: 'hoje',
  setLastDestination: (lastDestination) => set({ lastDestination }),
  paletteOpen: false,
  setPaletteOpen: (value) => set({ paletteOpen: value }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
}), {
  name: 'orbit-shell-store',
  version: 1,
  storage: createJSONStorage<Pick<ShellState, 'sidebarCollapsed'>>(() => sidebarStorage),
  partialize: ({ sidebarCollapsed }) => ({ sidebarCollapsed }),
  skipHydration: true,
  merge: (persisted, current) => ({
    ...current,
    sidebarCollapsed: typeof persisted === 'object' && persisted !== null
      && 'sidebarCollapsed' in persisted && typeof persisted.sidebarCollapsed === 'boolean'
      ? persisted.sidebarCollapsed : current.sidebarCollapsed,
  }),
  onRehydrateStorage: () => (_state, error) => {
    if (error) captureException(error)
  },
}))
