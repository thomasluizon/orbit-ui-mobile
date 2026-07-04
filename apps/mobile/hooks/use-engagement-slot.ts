import { resolveEngagementSlot, type EngagementSlotCard } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useFriends } from '@/hooks/use-friends'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

export interface EngagementSlotContext {
  isTodayView: boolean
  isTodayDate: boolean
}

/**
 * Arbitrates Today's single engagement slot (D2): at most one of trial banner,
 * setup checklist, referral entry, or social entry is visible, in that priority.
 */
export function useEngagementSlot({
  isTodayView,
  isTodayDate,
}: EngagementSlotContext): { slot: EngagementSlotCard | null } {
  const { profile } = useProfile()
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
    referral: isTodayView && isTodayDate && !homeEntryDismissed,
    socialEntry:
      isTodayView &&
      isTodayDate &&
      (pendingFriendRequests > 0 || !socialEntryDismissed),
  })

  return { slot }
}
