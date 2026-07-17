'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { isValidReferralCode } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
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

export default function SocialPage() {
  return (
    <Suspense fallback={null}>
      <SocialPageContent />
    </Suspense>
  )
}

function SocialPageContent() {
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
    // react-doctor-disable-next-line url-prefilled-privileged-action -- code is format-validated then only pre-fills InviteConfirmSheet, which server-validates (useInvitePreview) and needs explicit send (useSendFriendRequest); no action auto-fires https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    const raw = searchParams.get('invite')
    return isValidReferralCode(raw) ? raw : null
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

  const renderTabContent = () => {
    if (tab === 'feed') {
      return <SocialFeed onCheer={setCheerTarget} onAddFriends={() => setTab('friends')} />
    }
    if (tab === 'friends') {
      return <SocialFriends onCheer={setCheerTarget} />
    }
    return <AccountabilitySection initialHabitId={newPairHabitId} />
  }

  const renderBody = () => {
    if (isLoading) return null
    if (!socialEnabled) return <SocialOptInGate />
    return (
      <div>
        <SocialIdentityBar />
        <ChallengesEntryCard />
        <SectionHeadTabs<SocialTab>
          tabs={tabs}
          active={tab}
          onChange={setTab}
          ariaLabel={t('social.title')}
        />
        {renderTabContent()}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative z-[1]">
        <AppBar back onBack={() => goBackOrFallback('/profile')} title={t('social.title')} />
        {renderBody()}
      </div>

      <CheerComposer target={cheerTarget} onClose={() => setCheerTarget(null)} />
      <InviteConfirmSheet code={inviteCode} onClose={closeInvite} />
    </div>
  )
}
