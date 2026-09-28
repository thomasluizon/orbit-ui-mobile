import { create } from 'zustand'
import {
  createVersionGateStoreState,
  type VersionGateStoreState,
} from '@orbit/shared/stores'

type ReloadReason = 'appUpdated' | 'accountChanged'

interface WebVersionGateStoreState extends VersionGateStoreState {
  reloadReason: ReloadReason | null
  requireReload: (reason: ReloadReason) => void
}

export const useVersionGateStore = create<WebVersionGateStoreState>((set) => ({
  ...createVersionGateStoreState(set as Parameters<typeof createVersionGateStoreState>[0]),
  reloadReason: null,
  requireReload: (reason) => set({ reloadReason: reason }),
}))
