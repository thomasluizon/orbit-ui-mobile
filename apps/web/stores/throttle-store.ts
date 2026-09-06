import { create } from 'zustand'
import { createThrottleStoreState, type ThrottleStoreState } from '@orbit/shared/stores'

export const useThrottleStore = create<ThrottleStoreState>((set) => createThrottleStoreState(set))
