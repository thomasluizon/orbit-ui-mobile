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
import { useGamificationProfile } from '@/hooks/use-gamification'
import { SectionLabel } from '@/components/ui/section-label'
import { SubscriptionCard } from './_components/subscription-card'
import { ProfileIdentityHeader } from './_components/profile-identity-header'
import { ProfileStatTiles } from './_components/profile-stat-tiles'
import { ProfileNavSections } from './_components/profile-nav-sections'
import { ProfileAccountActions } from './_components/profile-account-actions'
import { ProfileHeaderBar } from './_components/profile-header-bar'
import { ProfileModals } from './_components/profile-modals'
import { useDataExport } from './_components/use-data-export'

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
  const { profile: gamificationProfile } = useGamificationProfile(
    profile?.hasProAccess ?? false,
  )
  const streak = profile?.currentStreak ?? 0
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
    profile?.hasProAccess && gamificationProfile
      ? t('gamification.profileCard.level', { level: gamificationProfile.level })
      : profile?.email

  return (
    <div className="relative">
      <ProfileHeaderBar streak={streak} error={error} />

      <div className="stagger-enter">
        <ProfileIdentityHeader
          isLoading={isLoading}
          showPlanBadge={!!showPlanBadge}
          planBadgeTone={planBadgeTone}
          planBadgeLabel={planBadgeLabel}
          name={profile?.name}
          identityLine={identityLine}
          onEditName={() => setShowEditName(true)}
        />

        <ProfileStatTiles
          streak={streak}
          achievementsEarned={gamificationProfile?.achievementsEarned ?? 0}
          showAchievements={!!achievementsNavItem}
          achievementsDataTour={
            achievementsNavItem ? navTourMap[achievementsNavItem.id] : undefined
          }
          onStreakClick={() => router.push('/streak')}
          onAchievementsClick={() => {
            if (achievementsNavItem) handleNavClick(achievementsNavItem)
          }}
        />

        <ProfileNavSections
          accountNavItems={accountNavItems}
          featureNavItems={featureNavItems}
          navTourMap={navTourMap}
          hasProAccess={profile?.hasProAccess ?? false}
          gamificationProfile={gamificationProfile}
          onNavClick={handleNavClick}
          onTourReplay={() => setShowTourReplay(true)}
        />

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

        <ProfileAccountActions
          isExporting={isExporting}
          exportError={exportError}
          onExport={() => {
            void exportData()
          }}
          onFreshStart={() => setShowResetModal(true)}
          onDeleteAccount={() => setShowDeleteModal(true)}
          onLogout={() => logout()}
        />
      </div>

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
    </div>
  )
}
