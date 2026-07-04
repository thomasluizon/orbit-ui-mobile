/** Today's engagement cards in strict priority order: the first eligible card wins the single slot. */
export const ENGAGEMENT_SLOT_PRIORITY = [
  'trial',
  'setupChecklist',
  'referral',
  'socialEntry',
] as const

export type EngagementSlotCard = (typeof ENGAGEMENT_SLOT_PRIORITY)[number]

export type EngagementSlotEligibility = Record<EngagementSlotCard, boolean>

/**
 * Resolves Today's single engagement slot: the highest-priority eligible card
 * (trial > setupChecklist > referral > socialEntry), or null
 * when no card is eligible. All other cards stay fully hidden.
 */
export function resolveEngagementSlot(
  eligibility: EngagementSlotEligibility,
): EngagementSlotCard | null {
  return ENGAGEMENT_SLOT_PRIORITY.find((card) => eligibility[card]) ?? null
}
