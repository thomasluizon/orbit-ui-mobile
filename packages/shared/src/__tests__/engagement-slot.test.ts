import { describe, expect, it } from 'vitest'
import {
  ENGAGEMENT_SLOT_PRIORITY,
  resolveEngagementSlot,
  type EngagementSlotCard,
  type EngagementSlotEligibility,
} from '../utils/engagement-slot'

function eligibilityOf(
  ...eligible: EngagementSlotCard[]
): EngagementSlotEligibility {
  return {
    trial: eligible.includes('trial'),
    setupChecklist: eligible.includes('setupChecklist'),
    referral: eligible.includes('referral'),
    socialEntry: eligible.includes('socialEntry'),
  }
}

describe('ENGAGEMENT_SLOT_PRIORITY', () => {
  it('locks the D2 priority order', () => {
    expect(ENGAGEMENT_SLOT_PRIORITY).toEqual([
      'trial',
      'setupChecklist',
      'referral',
      'socialEntry',
    ])
  })
})

describe('resolveEngagementSlot', () => {
  it('returns null when no card is eligible', () => {
    expect(resolveEngagementSlot(eligibilityOf())).toBeNull()
  })

  it('returns the sole eligible card for each of the four cards', () => {
    for (const card of ENGAGEMENT_SLOT_PRIORITY) {
      expect(resolveEngagementSlot(eligibilityOf(card))).toBe(card)
    }
  })

  it('picks trial over every other card', () => {
    expect(
      resolveEngagementSlot(
        eligibilityOf('trial', 'setupChecklist', 'referral', 'socialEntry'),
      ),
    ).toBe('trial')
  })

  it('picks setupChecklist over referral and socialEntry', () => {
    expect(
      resolveEngagementSlot(eligibilityOf('setupChecklist', 'referral', 'socialEntry')),
    ).toBe('setupChecklist')
  })

  it('picks referral over socialEntry', () => {
    expect(resolveEngagementSlot(eligibilityOf('referral', 'socialEntry'))).toBe(
      'referral',
    )
  })

  it('resolves all 16 eligibility combinations to the highest-priority eligible card', () => {
    for (let mask = 0; mask < 1 << ENGAGEMENT_SLOT_PRIORITY.length; mask += 1) {
      const eligible = ENGAGEMENT_SLOT_PRIORITY.filter(
        (_, index) => (mask & (1 << index)) !== 0,
      )

      expect(resolveEngagementSlot(eligibilityOf(...eligible))).toBe(
        eligible[0] ?? null,
      )
    }
  })
})
