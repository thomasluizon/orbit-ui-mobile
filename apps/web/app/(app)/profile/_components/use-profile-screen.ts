'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { profileKeys } from '@orbit/shared/query'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { deriveNextRewardCarrot } from '@orbit/shared/utils'
import { useProfile, useTrialDaysLeft, useTrialExpired } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useAuthStore } from '@/stores/auth-store'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useDataExport } from './use-data-export'

const NAV_TOUR_MAP: Record<string, string> = {
  preferences: 'tour-profile-preferences',
  retrospective: 'tour-profile-retrospective',
  achievements: 'tour-profile-achievements',
}

export function useProfileScreen() {
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
  const accountNavItems = PROFILE_NAV_ITEMS.filter((item) => item.section === 'account')
  const achievementsNavItem = PROFILE_NAV_ITEMS.find((item) => item.id === 'achievements')

  useEffect(() => {
    if (searchParams.get('subscription') === 'success') {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
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

  function handleStreakClick() {
    router.push('/streak')
  }

  function handleAchievementsClick() {
    if (achievementsNavItem) handleNavClick(achievementsNavItem)
  }

  const showPlanBadge = profile?.isTrialActive || profile?.hasProAccess
  const planBadgeTone: 'soft' | 'violet' = profile?.isTrialActive ? 'soft' : 'violet'
  const planBadgeLabel = profile?.isTrialActive
    ? t('trial.proBadge')
    : t('common.proBadge')

  const identityLine =
    canViewGamification && gamificationProfile
      ? t('gamification.profileCard.level', { level: gamificationProfile.level })
      : profile?.email

  return {
    profile,
    isLoading,
    error,
    isDesktop,
    streak,
    trialDaysLeft,
    trialExpired,
    gamificationProfile,
    nextRewardCarrot,
    achievementsLocked,
    achievementsTileValue,
    achievementsNavItem,
    statsLoading,
    accountNavItems,
    navTourMap: NAV_TOUR_MAP,
    showPlanBadge,
    planBadgeTone,
    planBadgeLabel,
    identityLine,
    isExporting,
    exportError,
    exportData,
    logout,
    showEditName,
    setShowEditName,
    showResetModal,
    setShowResetModal,
    showDeleteModal,
    setShowDeleteModal,
    showTourReplay,
    setShowTourReplay,
    showReferral,
    setShowReferral,
    handleNavClick,
    handleStreakClick,
    handleAchievementsClick,
  }
}
