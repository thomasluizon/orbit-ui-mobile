import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createReferralPromptStoreState,
  getPersistedReferralPromptState,
  migratePersistedReferralPromptState,
  type PersistedReferralPromptState,
  type ReferralPromptStoreState,
} from '@orbit/shared/stores'

export const useReferralPromptStore = create<ReferralPromptStoreState>()(
  persist(
    (set) =>
      createReferralPromptStoreState(
        set as Parameters<typeof createReferralPromptStoreState>[0],
      ),
    {
      name: 'orbit-referral-prompt-store',
      version: 1,
      storage: createJSONStorage<PersistedReferralPromptState>(() => AsyncStorage),
      migrate: migratePersistedReferralPromptState,
      partialize: getPersistedReferralPromptState,
    },
  ),
)
