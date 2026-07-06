import { createContext, useContext, useMemo, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { profileKeys } from '@orbit/shared/query'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { formatAPIDate } from '@orbit/shared/utils'
import type { BulkHabitItem, CreateHabitRequest } from '@orbit/shared/types/habit'
import type { CreateGoalRequest } from '@orbit/shared/types/goal'
import type { Profile } from '@orbit/shared/types/profile'
import type { OnboardingWeekStartDay } from '@orbit/shared/stores'
import type { ColorScheme } from '@orbit/shared/theme'
import { useBulkCreateHabits, useCreateHabit, useLogHabit } from '@/hooks/use-habits'
import { useCreateGoal } from '@/hooks/use-goals'
import { useProfile } from '@/hooks/use-profile'
import { useAppTheme } from '@/lib/use-app-theme'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

/**
 * The mode-blind action surface the onboarding step components call. The pre-auth
 * route host supplies a store-buffering implementation; the retained post-auth overlay
 * supplies live TanStack/profile mutations. `onImport` is omitted pre-auth.
 */
export interface OnboardingActions {
  createHabit: (input: CreateHabitRequest) => Promise<{ id: string; title: string }>
  createHabitsBulk: (items: BulkHabitItem[]) => Promise<void>
  logHabit: (habitId: string) => Promise<void>
  createGoal: (input: CreateGoalRequest) => Promise<void>
  setWeekStartDay: (day: OnboardingWeekStartDay) => Promise<void>
  setColorScheme: (scheme: string) => Promise<void>
  finishOnboarding: () => Promise<void>
  onImport?: () => void
}

interface OnboardingActionsContextValue {
  actions: OnboardingActions
  hasProAccess: boolean
  isLive: boolean
}

const OnboardingActionsContext = createContext<OnboardingActionsContextValue | null>(null)

/** Provides the active onboarding action set (pre-auth buffering or post-auth live) to the steps below. */
export function OnboardingActionsProvider({
  actions,
  hasProAccess,
  isLive,
  children,
}: Readonly<{
  actions: OnboardingActions
  hasProAccess: boolean
  isLive: boolean
  children: ReactNode
}>) {
  const value = useMemo(
    () => ({ actions, hasProAccess, isLive }),
    [actions, hasProAccess, isLive],
  )
  return (
    <OnboardingActionsContext.Provider value={value}>
      {children}
    </OnboardingActionsContext.Provider>
  )
}

function useOnboardingActionsContext(): OnboardingActionsContextValue {
  const value = useContext(OnboardingActionsContext)
  if (!value) {
    throw new Error('useOnboardingActions must be used within an OnboardingActionsProvider')
  }
  return value
}

/** Reads the onboarding actions from context; throws when used outside the provider. */
export function useOnboardingActions(): OnboardingActions {
  return useOnboardingActionsContext().actions
}

/** Whether the current onboarding mode grants Pro-gated steps (goal step, color scheme). */
export function useOnboardingHasProAccess(): boolean {
  return useOnboardingActionsContext().hasProAccess
}

/** Whether onboarding is running post-auth (live). False in the pre-auth buffering flow. */
export function useOnboardingIsLive(): boolean {
  return useOnboardingActionsContext().isLive
}

/** Pre-auth factory: every answer is buffered into the persisted draft store; signup is the terminal step. */
export function useBufferOnboardingActions(): OnboardingActions {
  const router = useRouter()

  return useMemo<OnboardingActions>(
    () => ({
      createHabit: async (input) => {
        const index = useOnboardingDraftStore.getState().bufferHabit(input)
        return { id: String(index), title: input.title }
      },
      createHabitsBulk: async (items) => {
        const store = useOnboardingDraftStore.getState()
        for (const item of items) {
          store.bufferHabit({
            title: item.title,
            ...(item.emoji != null ? { emoji: item.emoji } : {}),
            ...(item.frequencyUnit != null ? { frequencyUnit: item.frequencyUnit } : {}),
            ...(item.frequencyQuantity != null
              ? { frequencyQuantity: item.frequencyQuantity }
              : {}),
            ...(item.isGeneral != null ? { isGeneral: item.isGeneral } : {}),
          })
        }
      },
      logHabit: async (habitId) => {
        useOnboardingDraftStore
          .getState()
          .bufferFirstLog(Number(habitId), formatAPIDate(new Date()))
      },
      createGoal: async (input) => {
        useOnboardingDraftStore.getState().bufferGoal(input)
      },
      setWeekStartDay: async (day) => {
        useOnboardingDraftStore.getState().bufferWeekStartDay(day)
      },
      setColorScheme: async (scheme) => {
        useOnboardingDraftStore.getState().bufferColorScheme(scheme)
      },
      finishOnboarding: async () => {
        useOnboardingDraftStore.getState().markOnboardingLocallyDone()
        router.replace('/login?from=onboarding')
      },
    }),
    [router],
  )
}

/** Post-auth factory: the retained overlay path, writing straight through to the live server state. */
export function useLiveOnboardingActions(): OnboardingActions {
  const router = useRouter()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const createHabit = useCreateHabit()
  const bulkCreateHabits = useBulkCreateHabits()
  const logHabit = useLogHabit()
  const createGoal = useCreateGoal()
  const { patchProfile } = useProfile()
  const { applyScheme } = useAppTheme()

  return useMemo<OnboardingActions>(
    () => ({
      createHabit: async (input) => {
        const created = await createHabit.mutateAsync(input)
        return { id: created.id, title: input.title }
      },
      createHabitsBulk: async (items) => {
        await bulkCreateHabits.mutateAsync({ habits: items })
      },
      logHabit: async (habitId) => {
        await logHabit.mutateAsync({ habitId })
      },
      createGoal: async (input) => {
        await createGoal.mutateAsync(input)
      },
      setWeekStartDay: async (day) => {
        await performQueuedApiMutation({
          type: 'setWeekStartDay',
          scope: 'profile',
          endpoint: API.profile.weekStartDay,
          method: 'PUT',
          payload: { weekStartDay: day },
          dedupeKey: 'onboarding-week-start-day',
        })
        patchProfile({ weekStartDay: day })
      },
      setColorScheme: async (scheme) => {
        applyScheme(scheme as ColorScheme)
      },
      finishOnboarding: async () => {
        try {
          await performQueuedApiMutation({
            type: 'completeOnboarding',
            scope: 'profile',
            endpoint: API.profile.onboarding,
            method: 'PUT',
            payload: undefined,
            dedupeKey: 'profile-onboarding-complete',
          })
        } catch {}
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, hasCompletedOnboarding: true } : old,
        )
        router.replace('/')
      },
      onImport: () => {
        void (async () => {
          await AsyncStorage.setItem(
            CHAT_DRAFT_STORAGE_KEY,
            t('onboarding.flow.meetAstra.importPrompt'),
          )
          router.replace('/chat')
        })()
      },
    }),
    [
      applyScheme,
      bulkCreateHabits,
      createGoal,
      createHabit,
      logHabit,
      patchProfile,
      queryClient,
      router,
      t,
    ],
  )
}
