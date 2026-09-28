import { create } from 'zustand'

type ReloadReason = 'appUpdated' | 'accountChanged'

interface WebVersionGateStoreState {
  upgradeRequired: boolean
  minVersion: string | null
  markUpgradeRequired: (minVersion: string | null) => void
  reloadReason: ReloadReason | null
  requireReload: (reason: ReloadReason) => void
}

export const useVersionGateStore = create<WebVersionGateStoreState>((set) => ({
  upgradeRequired: false,
  minVersion: null,
  markUpgradeRequired: (minVersion) => set({ upgradeRequired: true, minVersion }),
  reloadReason: null,
  requireReload: (reason) => set({ reloadReason: reason }),
}))
