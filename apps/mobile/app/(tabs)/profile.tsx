import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useTourTarget } from '@/hooks/use-tour-target'
import { useTourScrollContainer } from '@/hooks/use-tour-scroll-container'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import {
  PROFILE_NAV_ITEMS,
  resolveProfileNavHint,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { CreditCard, Lock, Pencil, User as UserIcon } from 'lucide-react-native'
import { deriveNextRewardCarrot } from '@orbit/shared/utils'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
} from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile, useStreakInfo } from '@/hooks/use-gamification'
import { AppBar } from '@/components/ui/app-bar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { SkeletonLine } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ReferralCard } from '@/components/referral/referral-card'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { plural } from '@/lib/plural'
import { NextRewardCarrot } from './profile/_components/next-reward-carrot'
import { ProfileAccountActions } from './profile/_components/profile-account-actions'
import { EditNameSheet } from './profile/_components/edit-name-sheet'
import { FreshStartModal } from './profile/_components/fresh-start-modal'
import { DeleteAccountModal } from './profile/_components/delete-account-modal'
import { useDataExport } from './profile/_components/use-data-export'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'

type Tokens = ReturnType<typeof createTokensV2>

const PROFILE_FEATURE_SECTIONS = [
  { labelKey: 'nav.social', ids: ['social'] },
  { labelKey: 'explore.sections.progress', ids: ['retrospective', 'wrapped'] },
  { labelKey: 'explore.sections.integrations', ids: ['calendar-sync'] },
  { labelKey: 'explore.sections.more', ids: ['about', 'advanced'] },
].map((section) => ({
  labelKey: section.labelKey,
  items: PROFILE_NAV_ITEMS.filter((item) => section.ids.includes(item.id)),
}))

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

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
  const styles = useMemo(() => createStyles(tokens), [tokens])

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

  const subscriptionLabel = profile?.isTrialActive
    ? t('profile.subscription.trial')
    : profile?.hasProAccess
      ? t('profile.subscription.pro')
      : trialExpired
        ? t('profile.subscription.trialEnded')
        : t('profile.subscription.free')

  const subscriptionHint = profile?.isTrialActive
    ? plural(
        t('profile.subscription.trialDaysLeft', {
          days: trialDaysLeft ?? 0,
        }),
        trialDaysLeft ?? 0,
      )
    : profile?.hasProAccess
      ? t('profile.subscription.proHint')
      : trialExpired
        ? t('profile.subscription.trialEndedHint')
        : t('profile.subscription.freeHint')

  const showPlanBadge = profile?.isTrialActive || profile?.hasProAccess
  const planBadgeTone: BadgeTone = profile?.isTrialActive ? 'soft' : 'violet'
  const planBadgeLabel = profile?.isTrialActive
    ? t('trial.proBadge')
    : t('common.proBadge')

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

        <Animated.View entering={sectionEntrance(0)} style={styles.identityBlock}>
          {isLoading ? (
            <>
              <SkeletonLine width={76} height={22} style={styles.skeletonBadge} />
              <SkeletonLine width={160} height={30} style={styles.skeletonName} />
              <SkeletonLine width={120} height={14} />
            </>
          ) : (
            <>
              {showPlanBadge ? (
                <Badge tone={planBadgeTone} style={styles.planBadge}>
                  {planBadgeLabel}
                </Badge>
              ) : null}
              <Pressable
                onPress={() => setShowEditName(true)}
                accessibilityRole="button"
                accessibilityLabel={t('profile.editName.title')}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.identityNameButton,
                  pressed ? styles.identityNamePressed : null,
                ]}
              >
                <Text
                  style={[styles.identityName, { color: tokens.fg1 }]}
                  numberOfLines={1}
                >
                  {profile?.name}
                </Text>
                <Pencil size={16} strokeWidth={1.8} color={tokens.fg3} />
              </Pressable>
              <Text
                style={[styles.identityLine, { color: tokens.fg2 }]}
                numberOfLines={1}
              >
                {identityLine}
              </Text>
            </>
          )}
        </Animated.View>

        <Animated.View entering={sectionEntrance(1)} style={styles.statRow}>
          {statsLoading ? (
            <>
              <View style={styles.statTileWrap}>
                <SkeletonLine height={110} style={styles.statSkeleton} />
              </View>
              <View style={styles.statTileWrap}>
                <SkeletonLine height={110} style={styles.statSkeleton} />
              </View>
            </>
          ) : (
            <>
              <View ref={streakRef} collapsable={false} style={styles.statTileWrap}>
                <Pressable
                  onPress={handleStreakPress}
                  accessibilityRole="button"
                  accessibilityLabel={`${streakValue} · ${streakLabel}`}
                  style={({ pressed }) => [
                    styles.statPressable,
                    pressed ? styles.statPressed : null,
                  ]}
                >
                  <StatTile emoji="🔥" value={streakValue} label={streakLabel} />
                </Pressable>
              </View>
              {achievementsNavItem ? (
                <View ref={achievementsRef} collapsable={false} style={styles.statTileWrap}>
                  <Pressable
                    onPress={() => handleNavPress(achievementsNavItem)}
                    accessibilityRole="button"
                    accessibilityLabel={`${achievementsTileValue} · ${achievementsLabel}${
                      achievementsLocked ? ` · ${t('common.locked')}` : ''
                    }`}
                    style={({ pressed }) => [
                      styles.statPressable,
                      pressed ? styles.statPressed : null,
                    ]}
                  >
                    <StatTile
                      emoji="🏆"
                      value={achievementsTileValue}
                      label={achievementsLabel}
                    />
                    {achievementsLocked ? (
                      <View
                        style={[
                          styles.lockBadge,
                          { backgroundColor: tintFromPrimary(tokens, 0.12) },
                        ]}
                      >
                        <Lock size={12} strokeWidth={2} color={tokens.primary} />
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </Animated.View>

        <Animated.View entering={sectionEntrance(2)}>
          <ReferralCard onOpen={() => setShowReferral(true)} />
        </Animated.View>

        <Animated.View entering={sectionEntrance(3)}>
          <NextRewardCarrot
            carrot={nextRewardCarrot}
            onUpgrade={() => router.push(buildUpgradeHref('/profile'))}
          />
        </Animated.View>

        <Animated.View entering={sectionEntrance(4)}>
          <SectionLabel>{t('profile.sections.account')}</SectionLabel>
          <View style={styles.groupWrap}>
            <SettingsGroup>
              {accountNavItems.map((item) => (
                <View
                  key={item.id}
                  ref={item.id === 'preferences' ? preferencesRef : undefined}
                  collapsable={false}
                >
                  <SettingsGroupRow
                    icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg1} />}
                    label={t(item.titleKey)}
                    hint={resolveProfileNavHint(
                      item,
                      {
                        hasProAccess: profile?.hasProAccess,
                        gamificationProfile,
                      },
                      t,
                    )}
                    onPress={() => handleNavPress(item)}
                    proBadge={item.proBadge}
                    proBadgeLabel={t('common.proBadge')}
                  />
                </View>
              ))}
            </SettingsGroup>
          </View>
        </Animated.View>

        <Animated.View entering={sectionEntrance(5)}>
          <SectionLabel>{t('explore.sections.discover')}</SectionLabel>
          <View style={styles.groupWrap}>
            <SettingsGroup>
              <SettingsGroupRow
                icon={<ProfileNavIcon iconKey="compass" color={tokens.fg1} />}
                label={t('tour.replay.title')}
                hint={t('explore.tourHint')}
                onPress={() => setShowTourReplay(true)}
              />
            </SettingsGroup>
          </View>
        </Animated.View>

        {PROFILE_FEATURE_SECTIONS.map((section, sectionIndex) => (
          <Animated.View
            key={section.labelKey}
            entering={sectionEntrance(6 + sectionIndex)}
          >
            <SectionLabel>{t(section.labelKey)}</SectionLabel>
            <View style={styles.groupWrap}>
              <SettingsGroup>
                {section.items.map((item) => (
                  <View
                    key={item.id}
                    ref={item.id === 'retrospective' ? retroRef : undefined}
                    collapsable={false}
                  >
                    <SettingsGroupRow
                      icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg1} />}
                      label={t(item.titleKey)}
                      hint={resolveProfileNavHint(
                        item,
                        {
                          hasProAccess: profile?.hasProAccess,
                          gamificationProfile,
                        },
                        t,
                      )}
                      onPress={() => handleNavPress(item)}
                      proBadge={item.proBadge}
                      proBadgeLabel={t('common.proBadge')}
                    />
                  </View>
                ))}
              </SettingsGroup>
            </View>
          </Animated.View>
        ))}

        <Animated.View entering={sectionEntrance(10)}>
          <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
          <View ref={subscriptionRef} collapsable={false} style={styles.groupWrap}>
            <SettingsGroup>
              <SettingsGroupRow
                icon={<CreditCard size={22} color={tokens.fg1} strokeWidth={1.8} />}
                label={t('profile.subscription.plan')}
                accessibilityLabel={
                  profile?.hasProAccess && !profile.isTrialActive
                    ? t('profile.subscription.manage')
                    : t('common.upgrade')
                }
                hint={`${subscriptionLabel} · ${subscriptionHint}`}
                onPress={() => router.push(buildUpgradeHref('/profile'))}
              />
            </SettingsGroup>
          </View>
        </Animated.View>

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

function createStyles(_tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: {
      paddingBottom: 80,
    },

    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      textAlign: 'center',
      marginVertical: 12,
    },

    identityBlock: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 18,
      gap: 6,
    },
    planBadge: {
      alignSelf: 'center',
    },
    identityNameButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
      minHeight: 44,
    },
    identityNamePressed: {
      opacity: 0.7,
    },
    identityName: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 32,
      letterSpacing: -0.32,
      lineHeight: 38,
      flexShrink: 1,
    },
    identityLine: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      maxWidth: '100%',
    },
    skeletonBadge: {
      borderRadius: 999,
    },
    skeletonName: {
      marginTop: 4,
    },

    statRow: {
      flexDirection: 'row',
      gap: 14,
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 18,
    },
    statTileWrap: {
      flex: 1,
    },
    statSkeleton: {
      borderRadius: 18,
    },
    statPressable: {
      flexDirection: 'row',
    },
    statPressed: {
      transform: [{ scale: 0.99 }],
      opacity: 0.92,
    },
    lockBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 22,
      height: 22,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },

    groupWrap: {
      paddingHorizontal: 20,
    },
  })
}
