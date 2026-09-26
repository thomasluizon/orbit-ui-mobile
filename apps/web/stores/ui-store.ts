import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createUIStoreState,
  getPersistedUIState,
  migratePersistedUIState,
  type PersistedUIState,
  type UIStoreState,
} from '@orbit/shared/stores'
import { getPersistStorage } from '@/lib/persist-storage'

const initialUIState: { current: UIStoreState | null } = { current: null }

function getInitialUIState(): UIStoreState {
  if (!initialUIState.current) throw new Error('UI store is not ready')
  return initialUIState.current
}

export const useUIStore = create<UIStoreState>()(
  persist(
    (set, get) =>
      createUIStoreState(
        set,
        get,
      ),
    {
      name: 'orbit-ui-store',
      version: 5,
      storage: createJSONStorage<PersistedUIState>(getPersistStorage),
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

export function setUIAccountScope(accountId: string | null): void {
  useUIStore.persist.setOptions({ name: `orbit-ui-store:${accountId ?? 'signed-out'}` })
  void useUIStore.persist.rehydrate()
}
