import { resolveEngagementSlot, type EngagementSlotCard } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useFriends } from '@/hooks/use-friends'
import { useReviewReminder } from '@/hooks/use-review-reminder'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

export interface EngagementSlotContext {
  isTodayView: boolean
  isTodayDate: boolean
}

/**
 * Arbitrates Today's single engagement slot (D2): at most one of trial banner,
 * setup checklist, review reminder, referral entry, or social entry is visible,
 * in that priority. Also exposes the single review-reminder instance so the
 * screen can wire its dismiss and rate actions.
 */
export function useEngagementSlot({
  isTodayView,
  isTodayDate,
}: EngagementSlotContext): {
  slot: EngagementSlotCard | null
  reviewReminder: ReturnType<typeof useReviewReminder>
} {
  const { profile } = useProfile()
  const reviewReminder = useReviewReminder(profile)
  const setupChecklistDismissed = useUIStore((s) => s.setupChecklistDismissed)
  const homeEntryDismissed = useEngagementPromptStore((s) => s.homeEntryDismissed)
  const socialEntryDismissed = useEngagementPromptStore((s) => s.socialEntryDismissed)
  const { data: friendsData } = useFriends({ enabled: profile?.socialOptIn ?? false })
  const pendingFriendRequests = friendsData?.incomingRequests.length ?? 0

  const slot = resolveEngagementSlot({
    trial: profile?.isTrialActive ?? false,
    setupChecklist: Boolean(
      isTodayView &&
        profile &&
        !setupChecklistDismissed &&
        !profile.hasCompletedOnboardingChecklist,
    ),
    reviewReminder: reviewReminder.shouldShow,
    referral: isTodayView && isTodayDate && !homeEntryDismissed,
    socialEntry:
      isTodayView &&
      isTodayDate &&
      (pendingFriendRequests > 0 || !socialEntryDismissed),
  })

  return { slot, reviewReminder }
}
