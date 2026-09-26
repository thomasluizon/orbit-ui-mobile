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

const initialEngagementPromptState: { current: EngagementPromptStoreState | null } = { current: null }

function getInitialEngagementPromptState(): EngagementPromptStoreState {
  if (!initialEngagementPromptState.current) throw new Error('Engagement prompt store is not ready')
  return initialEngagementPromptState.current
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
      storage: createJSONStorage<PersistedEngagementPromptState>(() => AsyncStorage),
      migrate: migratePersistedEngagementPromptState,
      partialize: getPersistedEngagementPromptState,
      skipHydration: true,
      merge: (persisted) => ({
        ...getInitialEngagementPromptState(),
        ...migratePersistedEngagementPromptState(persisted),
      }),
    },
  ),
)

initialEngagementPromptState.current = useEngagementPromptStore.getInitialState()

export const useReferralPromptStore = useEngagementPromptStore

export async function setEngagementPromptAccountScope(accountId: string | null): Promise<void> {
  useEngagementPromptStore.persist.setOptions({
    name: `orbit-referral-prompt-store:${accountId ?? 'signed-out'}`,
  })
  await useEngagementPromptStore.persist.rehydrate()
}
