import { create } from 'zustand'
import {
  createVersionGateStoreState,
  type VersionGateStoreState,
} from '@orbit/shared/stores'

type ReloadReason = 'appUpdated' | 'accountChanged'

interface WebVersionGateStoreState extends VersionGateStoreState {
  reloadReason: ReloadReason | null
  requireReload: (reason: ReloadReason) => void
  updateDismissed: boolean
  dismissUpdate: () => void
}

export const useVersionGateStore = create<WebVersionGateStoreState>((set) => ({
  ...createVersionGateStoreState(set as Parameters<typeof createVersionGateStoreState>[0]),
  markUpgradeRequired: (minVersion) => set({ upgradeRequired: true, minVersion, updateDismissed: false }),
  reloadReason: null,
  requireReload: (reason) => set({ reloadReason: reason }),
  updateDismissed: false,
  dismissUpdate: () => set({ updateDismissed: true }),
}))
