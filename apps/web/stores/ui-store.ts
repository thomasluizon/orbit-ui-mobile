import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createUIStoreState,
  getPersistedUIState,
  migratePersistedUIState,
  type PersistedUIState,
  type UIStoreState,
} from '@orbit/shared/stores'
import { getPersistStorage } from '@/lib/persist-storage'

export const useUIStore = create<UIStoreState>()(
  persist(
    (set, get) =>
      createUIStoreState(
        set,
        get,
      ),
    {
      name: 'orbit-ui-store',
      version: 2,
      storage: createJSONStorage<PersistedUIState>(getPersistStorage),
      migrate: migratePersistedUIState,
      partialize: getPersistedUIState,
      skipHydration: true,
    },
  ),
)
