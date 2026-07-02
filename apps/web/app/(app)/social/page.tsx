'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { SocialOptInGate } from './_components/social-opt-in-gate'
import { SocialIdentityBar } from './_components/social-identity-bar'
import { SocialFeed } from './_components/social-feed'
import { SocialFriends } from './_components/social-friends'
import { AccountabilitySection } from './_components/accountability-section'
import { ChallengesEntryCard } from './_components/challenges-entry-card'
import { CheerComposer, type CheerTarget } from './_components/cheer-composer'

type SocialTab = 'feed' | 'friends' | 'buddies'

export default function SocialPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const searchParams = useSearchParams()
  const { profile, isLoading } = useProfile()
  const [tab, setTab] = useState<SocialTab>(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'buddies' || tabParam === 'friends' ? tabParam : 'feed'
  })
  const newPairHabitId = searchParams.get('newPairHabitId')
  const [cheerTarget, setCheerTarget] = useState<CheerTarget | null>(null)

  const socialEnabled = profile?.socialOptIn ?? false

  const tabs: SectionHeadTabItem<SocialTab>[] = [
    { id: 'feed', label: t('social.tabs.feed') },
    { id: 'friends', label: t('social.tabs.friends') },
    { id: 'buddies', label: t('social.tabs.buddies') },
  ]

  return (
    <div className="relative">
      <div className="md:hidden">
        <GradientTop height={200} />
      </div>
      <div className="relative z-[1]">
        <AppBar back onBack={() => goBackOrFallback('/profile')} title={t('social.title')} />
        {isLoading ? null : !socialEnabled ? (
          <SocialOptInGate />
        ) : (
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_auto_auto_1fr] md:items-start md:gap-x-8">
            <div className="md:col-start-2 md:row-start-1">
              <SocialIdentityBar />
            </div>
            <div className="md:col-start-2 md:row-start-2">
              <ChallengesEntryCard />
            </div>
            <div className="md:col-start-1 md:row-start-1">
              <SectionHeadTabs<SocialTab>
                tabs={tabs}
                active={tab}
                onChange={setTab}
                ariaLabel={t('social.title')}
                className="md:justify-start"
              />
            </div>
            {tab === 'feed' ? (
              <SocialFeed onCheer={setCheerTarget} onAddFriends={() => setTab('friends')} />
            ) : tab === 'friends' ? (
              <SocialFriends onCheer={setCheerTarget} />
            ) : (
              <AccountabilitySection initialHabitId={newPairHabitId} />
            )}
          </div>
        )}
      </div>

      <CheerComposer target={cheerTarget} onClose={() => setCheerTarget(null)} />
    </div>
  )
}
