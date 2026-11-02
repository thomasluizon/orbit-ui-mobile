'use client'

import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'

export function EngagementPrompts() {
  return <>
    <MarketingConsentPrompt />
    <ReferralPrompt />
    <MilestoneSharePrompt />
  </>
}
