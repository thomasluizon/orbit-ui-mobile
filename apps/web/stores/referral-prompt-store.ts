import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createReferralPromptStoreState,
  getPersistedReferralPromptState,
  migratePersistedReferralPromptState,
  type PersistedReferralPromptState,
  type ReferralPromptStoreState,
} from '@orbit/shared/stores'

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const useReferralPromptStore = create<ReferralPromptStoreState>()(
  persist(
    (set) =>
      createReferralPromptStoreState(
        set as Parameters<typeof createReferralPromptStoreState>[0],
      ),
    {
      name: 'orbit-referral-prompt-store',
      version: 1,
      storage: createJSONStorage<PersistedReferralPromptState>(() =>
        globalThis.localStorage === undefined
          ? noopStorage
          : globalThis.localStorage,
      ),
      migrate: migratePersistedReferralPromptState,
      partialize: getPersistedReferralPromptState,
      skipHydration: true,
    },
  ),
)
