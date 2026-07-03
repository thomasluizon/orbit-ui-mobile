'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { InviteConfirmSheet } from './_components/invite-confirm-sheet'

type SocialTab = 'feed' | 'friends' | 'buddies'

const REFERRAL_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/

export default function SocialPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profile, isLoading } = useProfile()
  const [tab, setTab] = useState<SocialTab>(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'buddies' || tabParam === 'friends' ? tabParam : 'feed'
  })
  const newPairHabitId = searchParams.get('newPairHabitId')
  const [cheerTarget, setCheerTarget] = useState<CheerTarget | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(() => {
    const raw = searchParams.get('invite')
    return raw && REFERRAL_CODE_PATTERN.test(raw) ? raw : null
  })

  function closeInvite() {
    setInviteCode(null)
    const next = new URLSearchParams(searchParams.toString())
    next.delete('invite')
    const query = next.toString()
    router.replace(query ? `/social?${query}` : '/social')
  }

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
          <div>
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
          </div>
        )}
      </div>

      <CheerComposer target={cheerTarget} onClose={() => setCheerTarget(null)} />
      <InviteConfirmSheet code={inviteCode} onClose={closeInvite} />
    </div>
  )
}
