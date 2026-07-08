import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useTourTarget } from '@/hooks/use-tour-target'
import { useTourScrollContainer } from '@/hooks/use-tour-scroll-container'
import { View, Text, ScrollView } from 'react-native'
import Animated from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { User as UserIcon } from 'lucide-react-native'
import { deriveNextRewardCarrot } from '@orbit/shared/utils'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
} from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile, useStreakInfo } from '@/hooks/use-gamification'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { ReferralCard } from '@/components/referral/referral-card'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { plural } from '@/lib/plural'
import { NextRewardCarrot } from './profile/_components/next-reward-carrot'
import { ProfileAccountActions } from './profile/_components/profile-account-actions'
import { EditNameSheet } from './profile/_components/edit-name-sheet'
import { FreshStartModal } from './profile/_components/fresh-start-modal'
import { DeleteAccountModal } from './profile/_components/delete-account-modal'
import { useDataExport } from './profile/_components/use-data-export'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'
import { createProfileStyles } from './profile/_components/profile-styles'
import { sectionEntrance } from './profile/_components/profile-section-entrance'
import { resolveProfileSubscriptionDisplay } from './profile/_components/profile-subscription-display'
import { ProfileIdentity } from './profile/_components/profile-identity'
import { ProfileStatRow } from './profile/_components/profile-stat-row'
import { ProfileSections } from './profile/_components/profile-sections'

export default function ProfileScreen() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const router = useRouter()
  const queryClient = useQueryClient()
  const { subscription } = useLocalSearchParams<{
    subscription?: string | string[]
  }>()
  const { profile, isLoading, error } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialExpired = useTrialExpired()
  const logout = useAuthStore((s) => s.logout)
  const canViewGamification = profile?.canViewGamification ?? false
  const { profile: gamificationProfile } = useGamificationProfile(canViewGamification)
  const { data: streakInfo } = useStreakInfo(canViewGamification)
  const nextRewardCarrot = deriveNextRewardCarrot(gamificationProfile, canViewGamification)
  const achievementsLocked = gamificationProfile?.achievementsLocked ?? false
  const achievementsTileValue = achievementsLocked
    ? gamificationProfile?.achievementsTotal ?? 0
    : gamificationProfile?.achievementsEarned ?? 0
  const { isExporting, exportError, exportData } = useDataExport()
  const streak = profile?.currentStreak ?? 0
  const statsLoading = isLoading || (canViewGamification && !gamificationProfile)
  const streakLabel = t('streakDisplay.title')
  const streakValue = `${streak} ${plural(t('streakDisplay.daysSuffix'), streak)}`
  const achievementsLabel = t('gamification.profileCard.tileLabel')
  const styles = useMemo(() => createProfileStyles(tokens), [tokens])

  const subscriptionRef = useRef<View>(null)
  const preferencesRef = useRef<View>(null)
  const retroRef = useRef<View>(null)
  const achievementsRef = useRef<View>(null)
  const streakRef = useRef<View>(null)
  useTourTarget('tour-profile-subscription', subscriptionRef)
  useTourTarget('tour-profile-preferences', preferencesRef)
  useTourTarget('tour-profile-retrospective', retroRef)
  useTourTarget('tour-profile-achievements', achievementsRef)
  useTourTarget('tour-profile-streak', streakRef)

  const profileScrollRef = useRef<ScrollView>(null)
  const profileScrollTo = useCallback((y: number) => {
    profileScrollRef.current?.scrollTo({ y, animated: true })
  }, [])
  const { onTourScroll: onProfileTourScroll } = useTourScrollContainer(
    '/profile',
    profileScrollTo,
  )

  const accountNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'account',
  )
  const achievementsNavItem = PROFILE_NAV_ITEMS.find(
    (item) => item.id === 'achievements',
  )

  const [showResetModal, setShowResetModal] = useState(false)
  const [showEditName, setShowEditName] = useState(false)
  const [showTourReplay, setShowTourReplay] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  useEffect(() => {
    if (subscription === 'success') {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    }
  }, [queryClient, subscription])

  const handleNavPress = useCallback(
    (item: ProfileNavItem) => {
      if (shouldRedirectProfileNavItem(item, profile)) {
        router.push(buildUpgradeHref('/profile'))
        return
      }

      router.push(item.route)
    },
    [profile, router],
  )

  const handleStreakPress = useCallback(() => {
    router.push('/streak')
  }, [router])

  const subscriptionDisplay = resolveProfileSubscriptionDisplay(
    profile,
    trialExpired,
    trialDaysLeft,
    t,
  )

  const identityLine =
    canViewGamification && gamificationProfile
      ? t('gamification.profileCard.level', { level: gamificationProfile.level })
      : profile?.email

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <GradientTop height={300} />
      <AppBar
        LeadingIcon={UserIcon}
        trailing={
          <>
            <ThemeToggle />
            <StreakBadge streak={profile?.currentStreak ?? 0} isFrozen={streakInfo?.isFrozenToday ?? false} />
            <NotificationBell />
          </>
        }
      />
      <ScrollView
        ref={profileScrollRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onProfileTourScroll}
        scrollEventThrottle={16}
      >
        {error ? (
          <Text style={[styles.errorText, { color: tokens.statusBadText }]}>
            {__DEV__ && error instanceof Error
              ? error.message
              : t('errors.loadProfile')}
          </Text>
        ) : null}

        <ProfileIdentity
          isLoading={isLoading}
          showBadge={subscriptionDisplay.showBadge}
          badgeTone={subscriptionDisplay.badgeTone}
          badgeLabel={subscriptionDisplay.badgeLabel}
          name={profile?.name}
          identityLine={identityLine}
          tokens={tokens}
          styles={styles}
          onEditName={() => setShowEditName(true)}
        />

        <ProfileStatRow
          statsLoading={statsLoading}
          streakValue={streakValue}
          streakLabel={streakLabel}
          achievementsNavItem={achievementsNavItem}
          achievementsTileValue={achievementsTileValue}
          achievementsLabel={achievementsLabel}
          achievementsLocked={achievementsLocked}
          tokens={tokens}
          styles={styles}
          streakRef={streakRef}
          achievementsRef={achievementsRef}
          onStreakPress={handleStreakPress}
          onAchievementsPress={() => {
            if (achievementsNavItem) handleNavPress(achievementsNavItem)
          }}
        />

        <Animated.View entering={sectionEntrance(2)}>
          <ReferralCard onOpen={() => setShowReferral(true)} />
        </Animated.View>

        <Animated.View entering={sectionEntrance(3)}>
          <NextRewardCarrot
            carrot={nextRewardCarrot}
            onUpgrade={() => router.push(buildUpgradeHref('/profile'))}
          />
        </Animated.View>

        <ProfileSections
          accountNavItems={accountNavItems}
          profile={profile}
          gamificationProfile={gamificationProfile}
          subscriptionLabel={subscriptionDisplay.label}
          subscriptionHint={subscriptionDisplay.hint}
          tokens={tokens}
          styles={styles}
          preferencesRef={preferencesRef}
          retroRef={retroRef}
          subscriptionRef={subscriptionRef}
          onNavPress={handleNavPress}
          onUpgrade={() => router.push(buildUpgradeHref('/profile'))}
          onShowTourReplay={() => setShowTourReplay(true)}
        />

        <Animated.View entering={sectionEntrance(11)}>
          <ProfileAccountActions
            isExporting={isExporting}
            exportError={exportError}
            displayName={profile?.name}
            onExport={() => {
              void exportData()
            }}
            onFreshStart={() => setShowResetModal(true)}
            onDeleteAccount={() => setShowDeleteModal(true)}
            onLogout={() => void logout()}
          />
        </Animated.View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <FreshStartModal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
      />

      <EditNameSheet open={showEditName} onClose={() => setShowEditName(false)} />

      <TourReplayModal
        visible={showTourReplay}
        onClose={() => setShowTourReplay(false)}
      />

      <DeleteAccountModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        profile={profile}
      />

      <ReferralDrawer
        open={showReferral}
        onClose={() => setShowReferral(false)}
      />
    </SafeAreaView>
  )
}
