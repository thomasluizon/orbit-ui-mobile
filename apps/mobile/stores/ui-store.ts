import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createUIStoreState,
  getPersistedUIState,
  type PersistedUIState,
  type UIStoreState,
} from '@orbit/shared/stores'

type UIStoreSet = {
  (partial: Partial<UIStoreState> | ((state: UIStoreState) => Partial<UIStoreState>), replace?: false): void
  (state: UIStoreState | ((state: UIStoreState) => UIStoreState), replace: true): void
}
type UIStoreGet = () => UIStoreState

export const useUIStore = create<UIStoreState>()(
  persist(
    (persistSet, persistGet) =>
      createUIStoreState(
        persistSet as UIStoreSet,
        persistGet as UIStoreGet,
      ),
    {
      name: 'orbit-ui-store',
      storage: createJSONStorage<PersistedUIState>(() => AsyncStorage),
      partialize: getPersistedUIState,
    },
  ),
)
