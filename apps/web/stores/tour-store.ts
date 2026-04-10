import { create } from 'zustand'
import { createTourStoreState, type TourStoreState } from '@orbit/shared/stores'

export const useTourStore = create<TourStoreState>((set, get) =>
  createTourStoreState(
    set as Parameters<typeof createTourStoreState>[0],
    get as Parameters<typeof createTourStoreState>[1],
  ),
)
