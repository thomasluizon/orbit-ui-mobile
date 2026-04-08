import { create } from 'zustand'
import { createUIStoreState, type UIStoreState } from '@orbit/shared/stores'

export const useUIStore = create<UIStoreState>((set, get) =>
  createUIStoreState(
    set as Parameters<typeof createUIStoreState>[0],
    get as Parameters<typeof createUIStoreState>[1],
  ),
)
