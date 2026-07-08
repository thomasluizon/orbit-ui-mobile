import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createEngagementPromptStoreState,
  getPersistedEngagementPromptState,
  migratePersistedEngagementPromptState,
  type EngagementPromptStoreState,
  type PersistedEngagementPromptState,
} from '@orbit/shared/stores'

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const useEngagementPromptStore = create<EngagementPromptStoreState>()(
  persist(
    (set) =>
      createEngagementPromptStoreState(
        set,
      ),
    {
      name: 'orbit-referral-prompt-store',
      version: 1,
      storage: createJSONStorage<PersistedEngagementPromptState>(() =>
        globalThis.localStorage === undefined
          ? noopStorage
          : globalThis.localStorage,
      ),
      migrate: migratePersistedEngagementPromptState,
      partialize: getPersistedEngagementPromptState,
      skipHydration: true,
    },
  ),
)

export const useReferralPromptStore = useEngagementPromptStore
