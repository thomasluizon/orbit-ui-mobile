import { create } from 'zustand'
import {
  createVersionGateStoreState,
  type VersionGateStoreState,
} from '@orbit/shared/stores'

export const useVersionGateStore = create<VersionGateStoreState>((set) =>
  createVersionGateStoreState(set as Parameters<typeof createVersionGateStoreState>[0]),
)

export function markUpgradeRequired(minVersion: string | null): void {
  useVersionGateStore.getState().markUpgradeRequired(minVersion)
}
