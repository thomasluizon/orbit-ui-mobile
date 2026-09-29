import { create } from 'zustand'
import { createAppToastStoreState, type AppToastStore } from '@orbit/shared/stores'

export const useAppToastStore = create<AppToastStore>((set, get) => createAppToastStoreState(set, get))
