'use client'

import { useTranslations } from 'next-intl'
import type { Profile } from '@orbit/shared/types/profile'
import { SectionLabel } from '@/components/ui/section-label'
import { SubscriptionCard } from './subscription-card'

interface ProfileSubscriptionSectionProps {
  profile: Profile | undefined
  trialDaysLeft: number | null
  trialExpired: boolean
}

export function ProfileSubscriptionSection({
  profile,
  trialDaysLeft,
  trialExpired,
}: Readonly<ProfileSubscriptionSectionProps>) {
  const t = useTranslations()

  return (
    <div>
      <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
      <div data-tour="tour-profile-subscription" className="px-5">
        <SubscriptionCard
          profile={profile}
          trialDaysLeft={trialDaysLeft}
          trialExpired={trialExpired}
        />
      </div>
    </div>
  )
}
