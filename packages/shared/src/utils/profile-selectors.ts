import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Profile } from '../types/profile'

export function getTrialDaysLeft(
  profile: Pick<Profile, 'trialEndsAt'> | null | undefined,
  now = new Date(),
): number | null {
  if (!profile?.trialEndsAt) return null
  return Math.max(0, differenceInCalendarDays(parseISO(profile.trialEndsAt), now))
}

export function getCurrentPlan(
  profile: Pick<Profile, 'hasProAccess' | 'isTrialActive'> | null | undefined,
): 'Free' | 'Pro' | 'Trial' {
  if (!profile) return 'Free'
  if (profile.isTrialActive) return 'Trial'
  if (profile.hasProAccess) return 'Pro'
  return 'Free'
}

export function getTrialExpired(
  profile: Pick<Profile, 'trialEndsAt' | 'isTrialActive' | 'plan'> | null | undefined,
): boolean {
  if (!profile) return false
  return profile.trialEndsAt !== null && !profile.isTrialActive && profile.plan === 'free'
}

export function getTrialUrgent(
  profile: Pick<Profile, 'trialEndsAt'> | null | undefined,
  now = new Date(),
): boolean {
  const trialDaysLeft = getTrialDaysLeft(profile, now)
  return trialDaysLeft !== null && trialDaysLeft <= 2
}

export function getIsYearlyPro(
  profile: Pick<Profile, 'hasProAccess' | 'isLifetimePro' | 'subscriptionInterval'> | null | undefined,
): boolean {
  if (!profile) return false
  return profile.hasProAccess && (profile.isLifetimePro || profile.subscriptionInterval === 'yearly')
}
