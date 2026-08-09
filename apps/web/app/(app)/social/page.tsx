'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { isValidReferralCode, resolveSocialTab } from '@orbit/shared/utils'
import type { SocialTab } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { SocialOptInGate } from './_components/social-opt-in-gate'
import { SocialIdentityBar } from './_components/social-identity-bar'
import { SocialFeed } from './_components/social-feed'
import { SocialFriends } from './_components/social-friends'
import { CheerComposer, type CheerTarget } from './_components/cheer-composer'
import { InviteConfirmSheet } from './_components/invite-confirm-sheet'


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
  const urlTab = resolveSocialTab(searchParams.get('tab'))
  const [tab, setTab] = useState<SocialTab>(urlTab)
  /**
   * A `useState` initializer runs once, but a notification can navigate here by QUERY ALONE. The
   * desktop topbar keeps NotificationBell mounted, so opening a stored `/social?tab=buddies` while
   * already on `/social` changes `searchParams` without remounting: the initializer never reruns and
   * the retired-tab redirect silently does not happen.
   *
   * The ref is what keeps this a synchronization rather than a clobber. Clicking a tab changes local
   * state and not the URL, so comparing against the LAST URL value means an unchanged URL never
   * overwrites the user's own choice; only a real query navigation does.
   */
  const lastUrlTab = useRef(urlTab)
  useEffect(() => {
    if (lastUrlTab.current === urlTab) return
    lastUrlTab.current = urlTab
    setTab(urlTab)
  }, [urlTab])
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
  ]

  const renderTabContent = () => {
    if (tab === 'feed') {
      return <SocialFeed onCheer={setCheerTarget} onAddFriends={() => setTab('friends')} />
    }
    return <SocialFriends onCheer={setCheerTarget} />
  }

  const renderBody = () => {
    if (isLoading) return null
    if (!socialEnabled) return <SocialOptInGate />
    return (
      <div>
        <SocialIdentityBar />
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
      <div className="md:hidden">
        <GradientTop height={200} />
      </div>
      <div className="relative z-[1]">
        <AppBar back onBack={() => goBackOrFallback('/profile')} title={t('social.title')} />
        {renderBody()}
      </div>

      <CheerComposer target={cheerTarget} onClose={() => setCheerTarget(null)} />
      <InviteConfirmSheet code={inviteCode} onClose={closeInvite} />
    </div>
  )
}
