import { create } from 'zustand'
import { createTourStoreState, type TourStoreState } from '@orbit/shared/stores'

export const useTourStore = create<TourStoreState>((set, get) =>
  createTourStoreState(
    set,
    get,
  ),
)
