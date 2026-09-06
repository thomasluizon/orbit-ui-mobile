import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { DroppedMutation } from '@/lib/offline-mutations'
import { captureError } from '@/lib/sentry'

interface OfflineSyncState {
  isFlushing: boolean
  isRetrying: boolean
  drops: DroppedMutation[]
  addDrop: (drop: DroppedMutation) => void
  dismissDrop: (id: string) => void
  clearDrops: () => Promise<void>
}

let resetVersion = 0
let hydrationResetVersion = 0
let isHydrating = false
const dismissedDuringHydration = new Set<string>()

export const useOfflineSyncStore = create<OfflineSyncState>()(persist((set) => ({
  isFlushing: false,
  isRetrying: false,
  drops: [],
  addDrop: (drop) => set((state) => ({
    drops: state.drops.some((entry) => entry.id === drop.id)
      ? state.drops
      : [...state.drops, drop],
  })),
  dismissDrop: (id) => {
    if (isHydrating) dismissedDuringHydration.add(id)
    set((state) => ({ drops: state.drops.filter((drop) => drop.id !== id) }))
  },
  clearDrops: async () => {
    resetVersion += 1
    await set({ drops: [] })
  },
}), {
  name: '@orbit/offline-sync-notices',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({ drops: state.drops }),
  merge: (persisted, current) => {
    const saved = persisted as Pick<OfflineSyncState, 'drops'> | undefined
    const drops = new Map(current.drops.map((drop) => [drop.id, drop]))
    if (resetVersion === hydrationResetVersion) {
      for (const drop of saved?.drops ?? []) {
        if (!drops.has(drop.id) && !dismissedDuringHydration.has(drop.id)) drops.set(drop.id, drop)
      }
    }
    return { ...current, drops: [...drops.values()] }
  },
  onRehydrateStorage: () => {
    isHydrating = true
    hydrationResetVersion = resetVersion
    dismissedDuringHydration.clear()
    return (state, error) => {
      isHydrating = false
      dismissedDuringHydration.clear()
      if (error) captureError(error)
      if (state) {
        void Promise.resolve(useOfflineSyncStore.setState({ drops: state.drops })).catch(captureError)
      }
    }
  },
}))
