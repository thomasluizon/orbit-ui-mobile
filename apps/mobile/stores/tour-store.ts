import { create } from 'zustand'
import { createTourStoreState, type TourStoreState } from '@orbit/shared/stores'

type TourStoreSet = {
  (
    partial: Partial<TourStoreState> | ((state: TourStoreState) => Partial<TourStoreState>),
    replace?: false,
  ): void
  (state: TourStoreState | ((state: TourStoreState) => TourStoreState), replace: true): void
}
type TourStoreGet = () => TourStoreState

export const useTourStore = create<TourStoreState>((set, get) =>
  createTourStoreState(set as TourStoreSet, get as TourStoreGet),
)
