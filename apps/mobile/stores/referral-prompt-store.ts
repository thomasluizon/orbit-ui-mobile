import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createEngagementPromptStoreState,
  getPersistedEngagementPromptState,
  migratePersistedEngagementPromptState,
  type EngagementPromptStoreState,
  type PersistedEngagementPromptState,
} from '@orbit/shared/stores'

export const useEngagementPromptStore = create<EngagementPromptStoreState>()(
  persist(
    (set) =>
      createEngagementPromptStoreState(
        set as Parameters<typeof createEngagementPromptStoreState>[0],
      ),
    {
      name: 'orbit-referral-prompt-store',
      version: 1,
      storage: createJSONStorage<PersistedEngagementPromptState>(() => AsyncStorage),
      migrate: migratePersistedEngagementPromptState,
      partialize: getPersistedEngagementPromptState,
    },
  ),
)

export const useReferralPromptStore = useEngagementPromptStore
