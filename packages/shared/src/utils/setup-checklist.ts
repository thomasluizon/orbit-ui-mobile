import type { Profile } from '../types/profile'

interface SetupChecklist {
  items: readonly { key: 'createHabit' | 'logHabit' | 'tryAstra'; done: boolean }[]
  done: number
}

export function getSetupChecklist(profile: Profile | undefined): SetupChecklist | null {
  if (!profile?.hasCompletedOnboarding || profile.isTrialActive || profile.hasCompletedOnboardingChecklist) return null
  const items = [
    { key: 'createHabit', done: profile.hasCreatedFirstHabit === true },
    { key: 'logHabit', done: profile.hasLoggedFirstHabit === true },
    { key: 'tryAstra', done: profile.hasTriedAstra === true },
  ] as const
  return { items, done: items.filter((item) => item.done).length }
}
