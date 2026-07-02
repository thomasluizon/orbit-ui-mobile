'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { useProfile } from '@/hooks/use-profile'
import { FeatureTileGrid } from '@/components/profile/feature-tile-grid'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'

const featureNavItems = PROFILE_NAV_ITEMS.filter(
  (item) => item.section === 'features',
)

export default function ExplorePage() {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const [showTourReplay, setShowTourReplay] = useState(false)

  function handleItemSelect(item: ProfileNavItem) {
    if (shouldRedirectProfileNavItem(item, profile)) {
      router.push('/upgrade')
      return
    }

    router.push(item.route)
  }

  return (
    <div className="min-h-dvh pb-10">
      <header className="flex flex-col gap-1.5 pt-6 pb-4 md:hidden">
        <h1 className="t-display text-balance">{t('explore.title')}</h1>
        <p className="t-secondary text-balance">{t('explore.subtitle')}</p>
      </header>
      <div className="stagger-enter md:pt-2" style={{ maxWidth: 680 }}>
        <FeatureTileGrid
          items={featureNavItems}
          profile={profile}
          onItemSelect={handleItemSelect}
          onTourReplay={() => setShowTourReplay(true)}
        />
      </div>
      <TourReplayModal open={showTourReplay} onOpenChange={setShowTourReplay} />
    </div>
  )
}
