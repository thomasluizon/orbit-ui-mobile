'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { useTranslations } from 'next-intl'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
} from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { deriveNextRewardCarrot } from '@orbit/shared/utils'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { SectionLabel } from '@/components/ui/section-label'
import { FeatureTileGrid } from '@/components/profile/feature-tile-grid'
import { ReferralCard } from '@/components/referral/referral-card'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { SubscriptionCard } from './_components/subscription-card'
import { ProfileIdentityHeader } from './_components/profile-identity-header'
import { ProfileStatTiles } from './_components/profile-stat-tiles'
import { NextRewardCarrot } from './_components/next-reward-carrot'
import { ProfileNavSections } from './_components/profile-nav-sections'
import { ProfileAccountActions } from './_components/profile-account-actions'
import { ProfileHeaderBar } from './_components/profile-header-bar'
import { ProfileModals } from './_components/profile-modals'
import { useDataExport } from './_components/use-data-export'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { ProfileSummaryCard } from './_components/profile-summary-card'

export default function ProfilePage() {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { profile, isLoading, error } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialExpired = useTrialExpired()
  const logout = useAuthStore((s) => s.logout)
  const { isExporting, exportError, exportData } = useDataExport()
  const isDesktop = useIsDesktop()
  const canViewGamification = profile?.canViewGamification ?? false
  const { profile: gamificationProfile } = useGamificationProfile(canViewGamification)
  const nextRewardCarrot = deriveNextRewardCarrot(gamificationProfile, canViewGamification)
  const achievementsLocked = gamificationProfile?.achievementsLocked ?? false
  const achievementsTileValue = achievementsLocked
    ? gamificationProfile?.achievementsTotal ?? 0
    : gamificationProfile?.achievementsEarned ?? 0
  const streak = profile?.currentStreak ?? 0
  const statsLoading = isLoading || (canViewGamification && !gamificationProfile)
  const accountNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'account',
  )
  const achievementsNavItem = PROFILE_NAV_ITEMS.find(
    (item) => item.id === 'achievements',
  )
  const featureNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'features' && item.id !== 'achievements',
  )

  const navTourMap: Record<string, string> = {
    preferences: 'tour-profile-preferences',
    retrospective: 'tour-profile-retrospective',
    achievements: 'tour-profile-achievements',
  }

  useEffect(() => {
    if (searchParams.get('subscription') === 'success') {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    }
  }, [searchParams, queryClient])

  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showTourReplay, setShowTourReplay] = useState(false)
  const [showEditName, setShowEditName] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  function handleNavClick(item: ProfileNavItem) {
    if (shouldRedirectProfileNavItem(item, profile)) {
      router.push('/upgrade')
      return
    }

    router.push(item.route)
  }

  const showPlanBadge = profile?.isTrialActive || profile?.hasProAccess
  const planBadgeTone = profile?.isTrialActive ? 'soft' : 'violet'
  const planBadgeLabel = profile?.isTrialActive
    ? t('trial.proBadge')
    : t('common.proBadge')

  const identityLine =
    canViewGamification && gamificationProfile
      ? t('gamification.profileCard.level', { level: gamificationProfile.level })
      : profile?.email

  const identityHeader = (
    <ProfileIdentityHeader
      isLoading={isLoading}
      showPlanBadge={!!showPlanBadge}
      planBadgeTone={planBadgeTone}
      planBadgeLabel={planBadgeLabel}
      name={profile?.name}
      identityLine={identityLine}
      onEditName={() => setShowEditName(true)}
    />
  )

  const statTiles = (
    <ProfileStatTiles
      streak={streak}
      achievementsValue={achievementsTileValue}
      achievementsLocked={achievementsLocked}
      showAchievements={!!achievementsNavItem}
      achievementsDataTour={
        achievementsNavItem ? navTourMap[achievementsNavItem.id] : undefined
      }
      isLoading={statsLoading}
      onStreakClick={() => router.push('/streak')}
      onAchievementsClick={() => {
        if (achievementsNavItem) handleNavClick(achievementsNavItem)
      }}
    />
  )

  const referral = <ReferralCard onOpen={() => setShowReferral(true)} />

  const nextReward = <NextRewardCarrot carrot={nextRewardCarrot} />

  const navSections = (
    <ProfileNavSections
      accountNavItems={accountNavItems}
      navTourMap={navTourMap}
      hasProAccess={profile?.hasProAccess}
      gamificationProfile={gamificationProfile}
      onNavClick={handleNavClick}
    />
  )

  const featuresSection = (
    <div>
      <SectionLabel>{t('profile.sections.features')}</SectionLabel>
      <nav aria-label={t('profile.sections.features')} className="px-5">
        <FeatureTileGrid
          items={featureNavItems}
          profile={profile}
          onItemSelect={handleNavClick}
          onTourReplay={() => setShowTourReplay(true)}
          dataTourMap={navTourMap}
        />
      </nav>
    </div>
  )

  const subscription = (
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

  const accountActions = (
    <ProfileAccountActions
      isExporting={isExporting}
      exportError={exportError}
      displayName={profile?.name}
      onExport={() => {
        void exportData()
      }}
      onFreshStart={() => setShowResetModal(true)}
      onDeleteAccount={() => setShowDeleteModal(true)}
      onLogout={() => logout()}
    />
  )

  return (
    <div className="relative">
      <ProfileHeaderBar streak={streak} error={error} />

      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-8 pt-2">
          <div className="stagger-enter min-w-0">
            {nextReward}
            {navSections}
          </div>
          <aside className="stagger-enter flex flex-col" style={{ gap: 8 }}>
            <ProfileSummaryCard
              name={profile?.name}
              isLoading={isLoading}
              showPlanBadge={!!showPlanBadge}
              planBadgeTone={planBadgeTone}
              planBadgeLabel={planBadgeLabel}
              levelLine={identityLine}
              streak={streak}
              achievementsValue={achievementsTileValue}
              achievementsLocked={achievementsLocked}
              showAchievements={!!achievementsNavItem}
              achievementsDataTour={
                achievementsNavItem ? navTourMap[achievementsNavItem.id] : undefined
              }
              onEditName={() => setShowEditName(true)}
              onStreakClick={() => router.push('/streak')}
              onAchievementsClick={() => {
                if (achievementsNavItem) handleNavClick(achievementsNavItem)
              }}
              onInvite={() => setShowReferral(true)}
            />
            {subscription}
            {accountActions}
          </aside>
        </div>
      ) : (
        <div className="stagger-enter">
          {identityHeader}
          {statTiles}
          {referral}
          {nextReward}
          {navSections}
          {featuresSection}
          {subscription}
          {accountActions}
        </div>
      )}

      <div style={{ height: 24 }} />

      <ProfileModals
        profile={profile}
        showEditName={showEditName}
        showResetModal={showResetModal}
        showDeleteModal={showDeleteModal}
        showTourReplay={showTourReplay}
        onEditNameChange={setShowEditName}
        onResetChange={setShowResetModal}
        onDeleteChange={setShowDeleteModal}
        onTourReplayChange={setShowTourReplay}
      />

      <ReferralDrawer open={showReferral} onOpenChange={setShowReferral} />
    </div>
  )
}
