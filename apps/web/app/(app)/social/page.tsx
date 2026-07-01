'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
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
  const router = useRouter()
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
        <GradientTop height={160} />
      </div>
      <div className="relative z-[1]">
        <AppBar back onBack={() => router.back()} title={t('social.title')} />
        {isLoading ? null : !socialEnabled ? (
          <SocialOptInGate />
        ) : (
          <>
            <SocialIdentityBar />
            <ChallengesEntryCard />
            <SectionHeadTabs<SocialTab>
              tabs={tabs}
              active={tab}
              onChange={setTab}
              ariaLabel={t('social.title')}
            />
            {tab === 'feed' ? (
              <SocialFeed onCheer={setCheerTarget} onAddFriends={() => setTab('friends')} />
            ) : tab === 'friends' ? (
              <SocialFriends onCheer={setCheerTarget} />
            ) : (
              <AccountabilitySection initialHabitId={newPairHabitId} />
            )}
          </>
        )}
      </div>

      <CheerComposer target={cheerTarget} onClose={() => setCheerTarget(null)} />
    </div>
  )
}
