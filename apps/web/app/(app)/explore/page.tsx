'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  buildProfileNavSections,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { useProfile } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ProfileNavGroup } from '@/components/profile/profile-nav-group'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'

const EXPLORE_SECTIONS = buildProfileNavSections([
  { labelKey: 'explore.sections.progress', ids: ['retrospective', 'wrapped', 'achievements'] },
  { labelKey: 'explore.sections.integrations', ids: ['calendar-sync'] },
  { labelKey: 'explore.sections.more', ids: ['about', 'advanced'] },
])

const featureTourTargets: Record<string, string> = {
  retrospective: 'tour-profile-retrospective',
}

export default function ExplorePage() {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const canViewGamification = profile?.canViewGamification ?? false
  const { profile: gamificationProfile } = useGamificationProfile(canViewGamification)
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
      <div className="stagger-enter md:pt-2">
        <SectionLabel>{t('explore.sections.discover')}</SectionLabel>
        <nav aria-label={t('explore.sections.discover')} className="px-5">
          <SettingsGroup>
            <SettingsGroupRow
              icon={<ProfileNavIcon iconKey="compass" />}
              label={t('tour.replay.title')}
              hint={t('explore.tourHint')}
              onClick={() => setShowTourReplay(true)}
            />
          </SettingsGroup>
        </nav>
        {EXPLORE_SECTIONS.map((section) => (
          <ProfileNavGroup
            key={section.labelKey}
            labelKey={section.labelKey}
            items={section.items}
            hasProAccess={profile?.hasProAccess}
            gamificationProfile={gamificationProfile}
            navTourMap={featureTourTargets}
            onNavClick={handleItemSelect}
          />
        ))}
      </div>
      <TourReplayModal open={showTourReplay} onOpenChange={setShowTourReplay} />
    </div>
  )
}
