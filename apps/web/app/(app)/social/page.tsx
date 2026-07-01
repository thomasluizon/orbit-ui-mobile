'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
import { useProfile } from '@/hooks/use-profile'
import { SocialOptInGate } from './_components/social-opt-in-gate'
import { SocialIdentityBar } from './_components/social-identity-bar'
import { SocialFeed } from './_components/social-feed'
import { SocialFriends } from './_components/social-friends'
import { CheerComposer, type CheerTarget } from './_components/cheer-composer'

type SocialTab = 'feed' | 'friends'

export default function SocialPage() {
  const t = useTranslations()
  const router = useRouter()
  const { profile, isLoading } = useProfile()
  const [tab, setTab] = useState<SocialTab>('feed')
  const [cheerTarget, setCheerTarget] = useState<CheerTarget | null>(null)

  const socialEnabled = profile?.socialOptIn ?? false

  const tabs: SectionHeadTabItem<SocialTab>[] = [
    { id: 'feed', label: t('social.tabs.feed') },
    { id: 'friends', label: t('social.tabs.friends') },
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
            <SectionHeadTabs<SocialTab>
              tabs={tabs}
              active={tab}
              onChange={setTab}
              ariaLabel={t('social.title')}
            />
            {tab === 'feed' ? (
              <SocialFeed onCheer={setCheerTarget} />
            ) : (
              <SocialFriends onCheer={setCheerTarget} />
            )}
          </>
        )}
      </div>

      <CheerComposer target={cheerTarget} onClose={() => setCheerTarget(null)} />
    </div>
  )
}
