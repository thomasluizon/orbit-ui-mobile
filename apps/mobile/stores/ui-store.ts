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

const initialUIState: { current: UIStoreState | null } = { current: null }

function getInitialUIState(): UIStoreState {
  if (!initialUIState.current) throw new Error('UI store is not ready')
  return initialUIState.current
}

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
      skipHydration: true,
      merge: (persisted) => ({
        ...getInitialUIState(),
        ...migratePersistedUIState(persisted),
      }),
    },
  ),
)

initialUIState.current = useUIStore.getInitialState()

export async function setUIAccountScope(accountId: string | null): Promise<void> {
  useUIStore.persist.setOptions({ name: `orbit-ui-store:${accountId ?? 'signed-out'}` })
  await useUIStore.persist.rehydrate()
}
