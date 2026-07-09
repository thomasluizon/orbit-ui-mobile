import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createEngagementPromptStoreState,
  getPersistedEngagementPromptState,
  migratePersistedEngagementPromptState,
  type EngagementPromptStoreState,
  type PersistedEngagementPromptState,
} from '@orbit/shared/stores'
import { getPersistStorage } from '@/lib/persist-storage'

export const useEngagementPromptStore = create<EngagementPromptStoreState>()(
  persist(
    (set) =>
      createEngagementPromptStoreState(
        set,
      ),
    {
      name: 'orbit-referral-prompt-store',
      version: 1,
      storage: createJSONStorage<PersistedEngagementPromptState>(getPersistStorage),
      migrate: migratePersistedEngagementPromptState,
      partialize: getPersistedEngagementPromptState,
      skipHydration: true,
    },
  ),
)

export const useReferralPromptStore = useEngagementPromptStore
