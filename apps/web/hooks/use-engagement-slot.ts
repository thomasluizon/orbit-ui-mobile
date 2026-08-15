'use client'

import { resolveEngagementSlot, type EngagementSlotCard } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

export interface EngagementSlotContext {
  isTodayView: boolean
  isTodayDate: boolean
}

/**
 * Arbitrates Today's single engagement slot (D2): at most one of trial banner,
 * setup checklist, or referral entry is visible, in that priority.
 * The trial banner itself renders app-wide from the layout; a 'trial' win means
 * Today renders no promo card beneath it.
 */
export function useEngagementSlot({
  isTodayView,
  isTodayDate,
}: EngagementSlotContext): { slot: EngagementSlotCard | null } {
  const { profile } = useProfile()
  const setupChecklistDismissed = useUIStore((s) => s.setupChecklistDismissed)
  const homeEntryDismissed = useEngagementPromptStore((s) => s.homeEntryDismissed)

  const slot = resolveEngagementSlot({
    trial: profile?.isTrialActive ?? false,
    setupChecklist: Boolean(
      isTodayView &&
        profile &&
        !setupChecklistDismissed &&
        !profile.hasCompletedOnboardingChecklist,
    ),
    referral: isTodayView && isTodayDate && !homeEntryDismissed,
  })

  return { slot }
}
