import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createUIStoreState,
  getPersistedUIState,
  type PersistedUIState,
  type UIStoreState,
} from '@orbit/shared/stores'

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const useUIStore = create<UIStoreState>()(
  persist(
    (set, get) =>
      createUIStoreState(
        set as Parameters<typeof createUIStoreState>[0],
        get as Parameters<typeof createUIStoreState>[1],
      ),
    {
      name: 'orbit-ui-store',
      storage: createJSONStorage<PersistedUIState>(() =>
        typeof globalThis.localStorage === 'undefined'
          ? noopStorage
          : globalThis.localStorage,
      ),
      partialize: getPersistedUIState,
    },
  ),
)
