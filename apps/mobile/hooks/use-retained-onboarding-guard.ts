import type { Profile } from '@orbit/shared/types/profile'

export function useRetainedOnboardingGuard(
  profile: Profile | null | undefined,
  suppressed: boolean,
  forceShow = false,
): boolean {
  return forceShow || (!suppressed && profile?.hasCompletedOnboarding === false)
}
