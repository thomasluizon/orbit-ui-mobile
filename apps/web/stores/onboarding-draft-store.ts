'use client'

import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createOnboardingDraftState,
  getPersistedOnboardingDraft,
  migrateOnboardingDraft,
  ONBOARDING_DRAFT_STORAGE_VERSION,
  type OnboardingDraftState,
  type PersistedOnboardingDraft,
} from '@orbit/shared/stores'

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const useOnboardingDraftStore = create<OnboardingDraftState>()(
  persist(
    (set, get) =>
      createOnboardingDraftState(
        set as Parameters<typeof createOnboardingDraftState>[0],
        get,
      ),
    {
      name: 'orbit-onboarding-draft',
      version: ONBOARDING_DRAFT_STORAGE_VERSION,
      storage: createJSONStorage<PersistedOnboardingDraft>(() =>
        globalThis.localStorage === undefined
          ? noopStorage
          : globalThis.localStorage,
      ),
      migrate: migrateOnboardingDraft,
      partialize: getPersistedOnboardingDraft,
      skipHydration: true,
    },
  ),
)

/** Reactive selector: true once the onboarding draft store has rehydrated from localStorage. */
export function useOnboardingDraftHydrated(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => useOnboardingDraftStore.persist.onFinishHydration(onStoreChange),
    () => useOnboardingDraftStore.persist.hasHydrated(),
    () => false,
  )
}

/** Reactive selector: true when the draft store holds unflushed pre-auth onboarding answers. */
export function useOnboardingHasPendingAnswers(): boolean {
  return useOnboardingDraftStore((state) => state.hasPendingAnswers())
}
