'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { formatAPIDate } from '@orbit/shared/utils'
import { profileKeys } from '@orbit/shared/query'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import type { CreateHabitRequest } from '@orbit/shared/types/habit'
import type { CreateGoalRequest } from '@orbit/shared/types/goal'
import type { Profile } from '@orbit/shared/types/profile'
import type { OnboardingWeekStartDay } from '@orbit/shared/stores'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useCreateHabit, useLogHabit } from '@/hooks/use-habits'
import { useCreateGoal } from '@/hooks/use-goals'
import {
  completeOnboarding,
  updateColorScheme as updateColorSchemeAction,
  updateWeekStartDay as updateWeekStartDayAction,
} from '@/app/actions/profile'

/** Canonical mode-blind action surface consumed by every onboarding step. */
export interface OnboardingActions {
  createHabit: (input: CreateHabitRequest) => Promise<{ id: string; title: string }>
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

/** Provides the active onboarding action surface (pre-auth buffering or post-auth live). */
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

/** The active onboarding action surface for the current mode. */
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

/** Pre-auth actions: buffer every answer into the local draft store, then route to signup. */
export function useBufferOnboardingActions(): OnboardingActions {
  const router = useRouter()

  return useMemo(
    () => ({
      createHabit: async (input) => {
        const index = useOnboardingDraftStore.getState().bufferHabit(input)
        return { id: String(index), title: input.title }
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
        router.push('/login?from=onboarding')
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
  const createHabit = useCreateHabit()
  const logHabit = useLogHabit()
  const createGoal = useCreateGoal()

  return useMemo(
    () => ({
      createHabit: async (input) => {
        const result = await createHabit.mutateAsync(input)
        return { id: result.id, title: input.title }
      },
      logHabit: async (habitId) => {
        await logHabit.mutateAsync({ habitId })
      },
      createGoal: async (input) => {
        await createGoal.mutateAsync(input)
      },
      setWeekStartDay: async (day) => {
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, weekStartDay: day } : old,
        )
        await updateWeekStartDayAction({ weekStartDay: day })
        queryClient.invalidateQueries({ queryKey: profileKeys.all })
      },
      setColorScheme: async (scheme) => {
        await updateColorSchemeAction({ colorScheme: scheme })
      },
      finishOnboarding: async () => {
        try {
          await completeOnboarding()
        } catch {
          void 0
        }
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, hasCompletedOnboarding: true } : old,
        )
        router.push('/')
      },
      onImport: () => {
        if (
          typeof globalThis !== 'undefined' &&
          typeof globalThis.localStorage !== 'undefined'
        ) {
          globalThis.localStorage.setItem(
            CHAT_DRAFT_STORAGE_KEY,
            t('onboarding.flow.meetAstra.importPrompt'),
          )
        }
        router.push('/chat')
      },
    }),
    [createHabit, logHabit, createGoal, queryClient, router, t],
  )
}
