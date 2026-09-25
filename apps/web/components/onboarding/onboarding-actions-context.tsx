'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { formatAPIDate } from '@orbit/shared/utils'
import { profileKeys } from '@orbit/shared/query'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import type { BulkHabitItem, CreateHabitRequest } from '@orbit/shared/types/habit'
import type { CreateGoalRequest } from '@orbit/shared/types/goal'
import type { Profile } from '@orbit/shared/types/profile'
import type { OnboardingWeekStartDay } from '@orbit/shared/stores'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useBulkCreateHabits, useCreateHabit, useLogHabit, useUpdateHabit } from '@/hooks/use-habits'
import { useCreateGoal } from '@/hooks/use-goals'
import {
  completeOnboarding,
  updateWeekStartDay as updateWeekStartDayAction,
} from '@/lib/actions/profile'
import { getHeldAccountId } from '@/stores/auth-store'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'

import { getAccountGeneration } from '@/lib/session-epoch'

/** Canonical mode-blind action surface consumed by every onboarding step. */
export interface OnboardingActions {
  createHabit: (input: CreateHabitRequest) => Promise<{ id: string; title: string }>
  updateHabit: (habitId: string, input: CreateHabitRequest) => Promise<void>
  createHabitsBulk: (items: BulkHabitItem[]) => Promise<void>
  logHabit: (habitId: string) => Promise<void>
  createGoal: (input: CreateGoalRequest) => Promise<void>
  setWeekStartDay: (day: OnboardingWeekStartDay) => Promise<void>
  deferPushRegistration: () => void
  finishOnboarding: () => Promise<void>
  onImport?: () => void
}

interface OnboardingActionsContextValue {
  actions: OnboardingActions
  isLive: boolean
}

const OnboardingActionsContext = createContext<OnboardingActionsContextValue | null>(null)

/** Provides the active onboarding action surface (pre-auth buffering or post-auth live). */
export function OnboardingActionsProvider({
  actions,
  isLive,
  children,
}: Readonly<{
  actions: OnboardingActions
  isLive: boolean
  children: ReactNode
}>) {
  const value = useMemo(
    () => ({ actions, isLive }),
    [actions, isLive],
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

/** The active onboarding action surface for the current mode. */
export function useOnboardingActions(): OnboardingActions {
  return useOnboardingActionsContext().actions
}

/** Whether onboarding is running post-auth (live). False in the pre-auth buffering flow. */
export function useOnboardingIsLive(): boolean {
  return useOnboardingActionsContext().isLive
}

/** Pre-auth actions: buffer every answer into the local draft store, then route to signup. */
export function useBufferOnboardingActions(): OnboardingActions {
  const router = useRouter()

  return useMemo(
    () => ({
      createHabit: (input) => {
        const index = useOnboardingDraftStore.getState().bufferHabit(input)
        return Promise.resolve({ id: String(index), title: input.title })
      },
      updateHabit: (habitId, input) => {
        useOnboardingDraftStore.getState().replaceHabit(Number(habitId), input)
        return Promise.resolve()
      },
      createHabitsBulk: (items) => {
        const store = useOnboardingDraftStore.getState()
        for (const item of items) store.bufferHabit({
          title: item.title,
          ...(item.emoji != null ? { emoji: item.emoji } : {}),
          ...(item.frequencyUnit != null ? { frequencyUnit: item.frequencyUnit } : {}),
          ...(item.frequencyQuantity != null ? { frequencyQuantity: item.frequencyQuantity } : {}),
          ...(item.isGeneral != null ? { isGeneral: item.isGeneral } : {}),
        })
        return Promise.resolve()
      },
      logHabit: (habitId) => {
        useOnboardingDraftStore.getState().bufferFirstLog(Number(habitId), formatAPIDate(new Date()))
        return Promise.resolve()
      },
      createGoal: (input) => { useOnboardingDraftStore.getState().bufferGoal(input); return Promise.resolve() },
      setWeekStartDay: (day) => { useOnboardingDraftStore.getState().bufferWeekStartDay(day); return Promise.resolve() },
      deferPushRegistration: () => useOnboardingDraftStore.getState().markPushPermissionGranted(),
      finishOnboarding: () => {
        useOnboardingDraftStore.getState().markOnboardingLocallyDone()
        router.push('/login?from=onboarding')
        return Promise.resolve()
      },
    }),
    [router],
  )
}

/** Post-auth actions for the retained overlay: today's live TanStack + Server-Action behavior. */
export function useLiveOnboardingActions(): OnboardingActions {
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const createHabit = useCreateHabit()
  const updateHabit = useUpdateHabit()
  const bulkCreateHabits = useBulkCreateHabits()
  const logHabit = useLogHabit()
  const createGoal = useCreateGoal()

  return useMemo(
    () => ({
      createHabit: async (input) => {
        const result = await createHabit.mutateAsync(input)
        return { id: result.id, title: input.title }
      },
      updateHabit: async (habitId, input) => {
        await updateHabit.mutateAsync({
          habitId,
          data: { ...input, isBadHabit: false, isGeneral: input.isGeneral ?? false, isFlexible: input.isFlexible ?? false, dueTime: input.dueTime ?? null },
        })
      },
      createHabitsBulk: async (items) => { await bulkCreateHabits.mutateAsync({ habits: items }) },
      logHabit: async (habitId) => { await logHabit.mutateAsync({ habitId, intent: 'log' }) },
      createGoal: async (input) => { await createGoal.mutateAsync(input) },
      setWeekStartDay: async (day) => {
        const intendedAccountId = getHeldAccountId()
        const accountGeneration = getAccountGeneration()
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) => old ? { ...old, weekStartDay: day } : old)
        try {
          await updateWeekStartDayAction({ weekStartDay: day }, intendedAccountId)
          if (getHeldAccountId() === intendedAccountId && getAccountGeneration() === accountGeneration) {
            void queryClient.invalidateQueries({ queryKey: profileKeys.all })
          }
        } catch (error) {
          if (reportsAccountChanged(error)) {
            if (getHeldAccountId() === intendedAccountId && getAccountGeneration() === accountGeneration) queryClient.clear()
            showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'))
          }
          throw error

        }
      },
      deferPushRegistration: () => undefined,
      finishOnboarding: async () => {
        const intendedAccountId = getHeldAccountId()

        const accountGeneration = getAccountGeneration()
        try {
          await completeOnboarding(intendedAccountId)
        } catch (error) {
          if (reportsAccountChanged(error)) {
            showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'))
            throw error
          }
        }
        if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
          showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'))
          throw Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED', status: 409 })
        }
        if (getAccountGeneration() !== accountGeneration) return
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, hasCompletedOnboarding: true } : old,
        )
        router.push('/')
      },
      onImport: () => {
        if ('localStorage' in globalThis) {
          globalThis.localStorage.setItem(
            CHAT_DRAFT_STORAGE_KEY,
            t('onboarding.flow.meetAstra.importPrompt'),
          )
        }
        router.push('/?astra=open')
      },
    }),
    [bulkCreateHabits, createGoal, createHabit, logHabit, queryClient, router, showPersistentError, t, updateHabit],
  )
}
