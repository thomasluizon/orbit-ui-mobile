import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createUIStoreState,
  getPersistedUIState,
  migratePersistedUIState,
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
      version: 1,
      storage: createJSONStorage<PersistedUIState>(() =>
        globalThis.localStorage === undefined
          ? noopStorage
          : globalThis.localStorage,
      ),
      migrate: migratePersistedUIState,
      partialize: getPersistedUIState,
      // SSR safety: don't auto-read localStorage on first client render. Both SSR and
      // first client render use the in-memory defaults; Providers triggers rehydrate()
      // in a mount effect so persisted state lands after hydration matches.
      skipHydration: true,
    },
  ),
)
