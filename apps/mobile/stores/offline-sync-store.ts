import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { DroppedMutation } from '@/lib/offline-mutations'

interface OfflineSyncState {
  isFlushing: boolean
  isRetrying: boolean
  drops: DroppedMutation[]
  addDrop: (drop: DroppedMutation) => void
  dismissDrop: (id: string) => void
}

export const useOfflineSyncStore = create<OfflineSyncState>()(persist((set) => ({
  isFlushing: false,
  isRetrying: false,
  drops: [],
  addDrop: (drop) => set((state) => ({
    drops: state.drops.some((entry) => entry.id === drop.id)
      ? state.drops
      : [...state.drops, drop],
  })),
  dismissDrop: (id) => set((state) => ({ drops: state.drops.filter((drop) => drop.id !== id) })),
}), {
  name: '@orbit/offline-sync-notices',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({ drops: state.drops }),
}))
