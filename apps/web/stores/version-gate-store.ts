import { create } from 'zustand'
import {
  createVersionGateStoreState,
  type VersionGateStoreState,
} from '@orbit/shared/stores'

export const useVersionGateStore = create<VersionGateStoreState>((set) =>
  createVersionGateStoreState(set as Parameters<typeof createVersionGateStoreState>[0]),
)
