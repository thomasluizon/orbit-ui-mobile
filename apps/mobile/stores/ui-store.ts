import { create } from 'zustand'
import { createUIStoreState, type UIStoreState } from '@orbit/shared/stores'

type UIStoreSet = {
  (partial: Partial<UIStoreState> | ((state: UIStoreState) => Partial<UIStoreState>), replace?: false): void
  (state: UIStoreState | ((state: UIStoreState) => UIStoreState), replace: true): void
}
type UIStoreGet = () => UIStoreState

export const useUIStore = create<UIStoreState>((set, get) =>
  createUIStoreState(
    set as UIStoreSet,
    get as UIStoreGet,
  ),
)
