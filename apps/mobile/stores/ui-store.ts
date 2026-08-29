import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createUIStoreState,
  getPersistedUIState,
  migratePersistedUIState,
  type PersistedUIState,
  type UIStoreState,
} from '@orbit/shared/stores'

export const useUIStore = create<UIStoreState>()(
  persist(
    (persistSet, persistGet) =>
      createUIStoreState(
        persistSet,
        persistGet,
      ),
    {
      name: 'orbit-ui-store',
      version: 5,
      storage: createJSONStorage<PersistedUIState>(() => AsyncStorage),
      migrate: migratePersistedUIState,
      partialize: getPersistedUIState,
    },
  ),
)
