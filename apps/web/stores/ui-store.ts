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
let accountGeneration = 0
let requestedAccountId: string | null | undefined
let hydratedAccountId: string | null | undefined
let preferencesMerged = false

export const useUIPreferencesReadiness = create(() => ({ ready: false }))

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
        () => accountGeneration,
      ),
    {
      name: 'orbit-ui-store',
      version: 7,
      storage: createJSONStorage<PersistedUIState>(getPersistStorage),
      migrate: migratePersistedUIState,
      partialize: getPersistedUIState,
      skipHydration: true,
      onRehydrateStorage: () => {
        preferencesMerged = false
        useUIPreferencesReadiness.setState({ ready: false })
        const generation = accountGeneration
        return () => {
          if (generation !== accountGeneration) return
          useUIPreferencesReadiness.setState({ ready: preferencesMerged })
        }
      },
      merge: (persisted, current) => {
        const state = hydratedAccountId !== undefined && hydratedAccountId !== requestedAccountId
          ? getInitialUIState()
          : current
        hydratedAccountId = requestedAccountId
        preferencesMerged = true
        return { ...state, ...migratePersistedUIState(persisted) }
      },
    },
  ),
)

initialUIState.current = useUIStore.getInitialState()

export function setUIAccountScope(accountId: string | null): void {
  if (requestedAccountId !== accountId) accountGeneration += 1
  requestedAccountId = accountId
  useUIStore.persist.setOptions({ name: `orbit-ui-store:${accountId ?? 'signed-out'}` })
  void useUIStore.persist.rehydrate()
}
