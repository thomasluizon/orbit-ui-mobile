import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  ONBOARDING_DRAFT_STORAGE_VERSION,
  createOnboardingDraftState,
  getPersistedOnboardingDraft,
  migrateOnboardingDraft,
  type OnboardingDraftState,
  type PersistedOnboardingDraft,
} from '@orbit/shared/stores'
import { getAccountId } from '@/lib/account-scope'

/** Draft store augmented with a hydration flag so the splash gate and route guards can wait for AsyncStorage rehydration. */
export interface OnboardingDraftStore extends OnboardingDraftState {
  _hasHydrated: boolean
}

export const useOnboardingDraftStore = create<OnboardingDraftStore>()(
  persist<OnboardingDraftStore, [], [], PersistedOnboardingDraft>(
    (set, get) => ({
      ...createOnboardingDraftState(
        set as Parameters<typeof createOnboardingDraftState>[0],
        get as Parameters<typeof createOnboardingDraftState>[1],
      ),
      _hasHydrated: false,
    }),
    {
      name: 'orbit-onboarding-draft',
      version: ONBOARDING_DRAFT_STORAGE_VERSION,
      storage: createJSONStorage<PersistedOnboardingDraft>(() => AsyncStorage),
      migrate: migrateOnboardingDraft,
      partialize: getPersistedOnboardingDraft,
      merge: (persisted, current) => {
        const draft = migrateOnboardingDraft(persisted)
        const accountId = getAccountId()
        return {
          ...current,
          ...(accountId !== null && draft.accountKey !== accountId
            ? migrateOnboardingDraft(null)
            : draft),
        }
      },
      onRehydrateStorage: () => () => {
        useOnboardingDraftStore.setState({ _hasHydrated: true })
      },
    },
  ),
)

/** Selector hook: has the persisted onboarding draft finished rehydrating from AsyncStorage? */
export function useOnboardingDraftHydrated(): boolean {
  return useOnboardingDraftStore((state) => state._hasHydrated)
}
