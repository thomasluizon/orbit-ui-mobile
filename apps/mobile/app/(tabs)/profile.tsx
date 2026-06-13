import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useTourTarget } from '@/hooks/use-tour-target'
import { useTourScrollContainer } from '@/hooks/use-tour-scroll-container'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  Share,
  type TextInput,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { File, Paths } from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { parseISO } from 'date-fns'
import { API } from '@orbit/shared/api'
import type { UserDataExport } from '@orbit/shared'
import { profileKeys } from '@orbit/shared/query'
import {
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getErrorMessage,
} from '@orbit/shared/utils'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import {
  Check,
  CreditCard,
  Download,
  LogOut,
  Pencil,
  RotateCcw,
  TriangleAlert,
  User as UserIcon,
  UserX,
  X,
} from 'lucide-react-native'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
} from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { apiClient } from '@/lib/api-client'
import { clearChecklistTemplates } from '@/lib/checklist-template-storage'
import {
  buildQueuedMutation,
  createQueuedAck,
  isQueuedResult,
  queueOrExecute,
} from '@/lib/offline-mutations'
import * as offlineQueue from '@/lib/offline-queue'
import { clearPersistedQueryCache } from '@/lib/query-client'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { AppTextInput } from '@/components/ui/app-text-input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { AppBar } from '@/components/ui/app-bar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { StatTile } from '@/components/ui/stat-tile'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'
import { plural } from '@/lib/plural'
import { ProfileNavIcon } from './profile/_components/profile-nav-icon'
import { ProfileActionButton } from './profile/_components/profile-action-button'
import { EditNameSheet } from './profile/_components/edit-name-sheet'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'

type Tokens = ReturnType<typeof createTokensV2>

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

function AmberPillButton({
  label,
  onPress,
  disabled = false,
}: Readonly<{
  label: string
  onPress: () => void
  disabled?: boolean
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        dangerPillStyles.base,
        { backgroundColor: tokens.statusOverdue },
        disabled ? dangerPillStyles.disabled : null,
        pressed && !disabled ? dangerPillStyles.pressed : null,
      ]}
    >
      <Text style={[dangerPillStyles.label, { color: tokens.fgOnPrimary }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function DangerPillButton({
  label,
  onPress,
  disabled = false,
}: Readonly<{
  label: string
  onPress: () => void
  disabled?: boolean
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        dangerPillStyles.base,
        { backgroundColor: tokens.statusBad },
        disabled ? dangerPillStyles.disabled : null,
        pressed && !disabled ? dangerPillStyles.pressed : null,
      ]}
    >
      <Text style={[dangerPillStyles.label, { color: tokens.fgOnPrimary }]}>
        {label}
      </Text>
    </Pressable>
  )
}

const dangerPillStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 26,
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
  },
})

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
  const { profile: gamificationProfile } = useGamificationProfile(
    profile?.hasProAccess ?? false,
  )
  const { isOnline } = useOffline()
  const { displayDate } = useDateFormat()
  const streak = profile?.currentStreak ?? 0
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
  const featureNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'features' && item.id !== 'achievements',
  )

  const getNavHint = useCallback(
    (item: ProfileNavItem): string => {
      if (
        item.hintMode === 'gamificationProfile' &&
        profile?.hasProAccess &&
        gamificationProfile
      ) {
        return `${t('gamification.profileCard.level', { level: gamificationProfile.level })} · ${t('gamification.profileCard.totalXp', { total: gamificationProfile.totalXp })}`
      }
      return t(item.hintKey)
    },
    [profile?.hasProAccess, gamificationProfile, t],
  )

  const [showFreshStartAnim, setShowFreshStartAnim] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showEditName, setShowEditName] = useState(false)
  const [resetStep, setResetStep] = useState<'info' | 'confirm'>('info')
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  const isResetConfirmed = resetConfirmText.trim().toUpperCase() === 'ORBIT'

  function openResetModal() {
    setResetStep('info')
    setResetConfirmText('')
    setResetError('')
    setResetLoading(false)
    setShowResetModal(true)
  }

  async function handleResetAccount() {
    if (!isResetConfirmed) return
    setResetLoading(true)
    setResetError('')
    try {
      type ResetMutationResult =
        | { queued: true; queuedMutationId: string }
        | { queued: false; queuedMutationId: string }

      const queuedResetMutation = buildQueuedMutation({
        type: 'resetProfile',
        scope: 'profile',
        endpoint: API.profile.reset,
        method: 'POST',
        payload: undefined,
        dedupeKey: 'profile-reset',
      })

      const result = await queueOrExecute<ResetMutationResult, ResetMutationResult>({
        mutation: queuedResetMutation,
        execute: async (mutation) => {
          await apiClient(mutation.endpoint, { method: mutation.method })
          return {
            queued: false,
            queuedMutationId: queuedResetMutation.id,
          }
        },
        queuedResult: createQueuedAck(queuedResetMutation.id),
      })

      offlineQueue.clear()
      if (isQueuedResult(result)) {
        offlineQueue.enqueue(queuedResetMutation)
      }

      await Promise.all([
        clearChecklistTemplates(),
        AsyncStorage.removeItem('orbit_trial_expired_seen'),
      ])
      queryClient.clear()
      await clearPersistedQueryCache()
      setShowResetModal(false)
      setShowFreshStartAnim(true)
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('profile.freshStart.errorGeneric'))
      setResetError(msg)
    } finally {
      setResetLoading(false)
    }
  }

  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  async function handleExportData() {
    if (isExporting) return
    if (!isOnline) {
      setExportError(t('errors.offline'))
      return
    }
    setIsExporting(true)
    setExportError('')
    try {
      const data = await apiClient<UserDataExport>(API.profile.export)
      const fileName = `orbit-data-export-${new Date().toISOString().slice(0, 10)}.json`
      const file = new File(Paths.cache, fileName)
      file.create({ overwrite: true })
      file.write(JSON.stringify(data, null, 2))
      await Share.share({
        title: t('dataExport.shareTitle'),
        url: file.uri,
      })
    } catch {
      setExportError(t('dataExport.error'))
    } finally {
      setIsExporting(false)
    }
  }

  const [showTourReplay, setShowTourReplay] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [deleteCodeDigits, setDeleteCodeDigits] = useState(['', '', '', '', '', ''])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState<string | null>(null)
  const deleteCodeRefs = useRef<(TextInput | null)[]>([])

  function openDeleteModal() {
    setDeleteStep('confirm')
    setDeleteCodeDigits(['', '', '', '', '', ''])
    setDeleteError('')
    setDeleteLoading(false)
    setScheduledDeletionDate(null)
    setShowDeleteModal(true)
  }

  function backToDeleteConfirmStep() {
    setDeleteStep('confirm')
    setDeleteCodeDigits(['', '', '', '', '', ''])
    setDeleteError('')
  }

  async function handleRequestDeletion() {
    if (!isOnline) {
      setDeleteError(t('errors.offline'))
      return
    }
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await apiClient(API.auth.requestDeletion, { method: 'POST' })
      setDeleteStep('code')
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('profile.deleteAccount.errorGeneric'))
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleConfirmDeletion() {
    const code = deleteCodeDigits.join('')
    if (code.length !== 6) return
    if (!isOnline) {
      setDeleteError(t('errors.offline'))
      return
    }
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const response = await apiClient<{ scheduledDeletionAt?: string | null }>(
        API.auth.confirmDeletion,
        {
          method: 'POST',
          body: JSON.stringify({ code }),
        },
      )
      setScheduledDeletionDate(response.scheduledDeletionAt ?? null)
      setDeleteStep('deactivated')
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('profile.deleteAccount.errorGeneric'))
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  const deletedItems = buildFreshStartDeletedItems(t)
  const preservedItems = buildFreshStartPreservedItems(t)

  const handleFreshStartComplete = useCallback(() => {
    setShowFreshStartAnim(false)
    queryClient.clear()
    router.replace('/')
  }, [queryClient, router])

  function focusDeleteCode(index: number) {
    deleteCodeRefs.current[index]?.focus()
  }

  function setDeleteCodeValue(index: number, value: string) {
    const digits = value.replace(/\D/g, '')

    if (digits.length > 1) {
      const next = ['0', '1', '2', '3', '4', '5'].map((_, i) => digits[i] ?? '')
      setDeleteCodeDigits(next)
      const nextIndex = next.findIndex((digit) => digit === '')
      if (nextIndex >= 0) {
        focusDeleteCode(nextIndex)
      } else {
        deleteCodeRefs.current[5]?.blur()
      }
      return
    }

    setDeleteCodeDigits((prev) => {
      const next = [...prev]
      next[index] = digits.slice(-1)
      return next
    })

    if (digits && index < 5) {
      focusDeleteCode(index + 1)
    }
  }

  function handleDeleteCodeKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !deleteCodeDigits[index] && index > 0) {
      focusDeleteCode(index - 1)
    }
  }

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

      router.push(item.route as Href)
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
    profile?.hasProAccess && gamificationProfile
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
            <StreakBadge streak={profile?.currentStreak ?? 0} />
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
          <Text style={[styles.errorText, { color: tokens.statusBad }]}>
            {__DEV__ && error instanceof Error
              ? error.message
              : t('errors.loadProfile')}
          </Text>
        ) : null}

        <Animated.View entering={sectionEntrance(0)} style={styles.identityBlock}>
          {isLoading ? (
            <>
              <View
                style={[
                  styles.skeleton,
                  { width: 76, height: 22, borderRadius: 999, backgroundColor: tokens.bgElev },
                ]}
              />
              <View
                style={[
                  styles.skeleton,
                  { width: 160, height: 30, marginTop: 4, backgroundColor: tokens.bgElev },
                ]}
              />
              <View
                style={[styles.skeleton, { width: 120, height: 14, backgroundColor: tokens.bgElev }]}
              />
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
                style={styles.identityNameButton}
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
          <View ref={streakRef} collapsable={false} style={styles.statTileWrap}>
            <Pressable
              onPress={handleStreakPress}
              accessibilityRole="button"
              accessibilityLabel={t('streakDisplay.title')}
              style={({ pressed }) => [
                styles.statPressable,
                pressed ? styles.statPressed : null,
              ]}
            >
              <StatTile
                emoji="🔥"
                value={`${streak} ${plural(t('streakDisplay.daysSuffix'), streak)}`}
                label={t('streakDisplay.title')}
              />
            </Pressable>
          </View>
          {achievementsNavItem ? (
            <View ref={achievementsRef} collapsable={false} style={styles.statTileWrap}>
              <Pressable
                onPress={() => handleNavPress(achievementsNavItem)}
                accessibilityRole="button"
                accessibilityLabel={t('gamification.profileCard.tileLabel')}
                style={({ pressed }) => [
                  styles.statPressable,
                  pressed ? styles.statPressed : null,
                ]}
              >
                <StatTile
                  emoji="🏆"
                  value={gamificationProfile?.achievementsEarned ?? 0}
                  label={t('gamification.profileCard.tileLabel')}
                />
              </Pressable>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View entering={sectionEntrance(2)}>
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
                    hint={getNavHint(item)}
                    onPress={() => handleNavPress(item)}
                    proBadge={item.proBadge}
                    proBadgeLabel={t('common.proBadge')}
                  />
                </View>
              ))}
            </SettingsGroup>
          </View>
        </Animated.View>

        <Animated.View entering={sectionEntrance(3)}>
          <SectionLabel>{t('profile.sections.features')}</SectionLabel>
          <View style={styles.groupWrap}>
            <SettingsGroup>
              <SettingsGroupRow
                icon={<ProfileNavIcon iconKey="compass" color={tokens.fg1} />}
                label={t('tour.replay.title')}
                hint={t('tour.replay.hint')}
                onPress={() => setShowTourReplay(true)}
              />
              {featureNavItems.map((item) => (
                <View
                  key={item.id}
                  ref={item.id === 'retrospective' ? retroRef : undefined}
                  collapsable={false}
                >
                  <SettingsGroupRow
                    icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg1} />}
                    label={t(item.titleKey)}
                    hint={getNavHint(item)}
                    onPress={() => handleNavPress(item)}
                    proBadge={item.proBadge}
                    proBadgeLabel={t('common.proBadge')}
                  />
                </View>
              ))}
            </SettingsGroup>
          </View>
        </Animated.View>

        <Animated.View entering={sectionEntrance(4)}>
          <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
          <View ref={subscriptionRef} collapsable={false} style={styles.groupWrap}>
            <SettingsGroup>
              <SettingsGroupRow
                icon={<CreditCard size={22} color={tokens.fg1} strokeWidth={1.8} />}
                label={t('profile.subscription.plan')}
                hint={`${subscriptionLabel} · ${subscriptionHint}`}
                onPress={() => router.push(buildUpgradeHref('/profile'))}
              />
            </SettingsGroup>
          </View>
        </Animated.View>

        <Animated.View entering={sectionEntrance(5)}>
          <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
          <ProfileActionButton
            icon={Download}
            onPress={() => {
              void handleExportData()
            }}
            label={isExporting ? t('dataExport.preparing') : t('dataExport.button')}
          />
          {exportError ? (
            <Text style={[styles.errorText, { color: tokens.statusBad }]}>
              {exportError}
            </Text>
          ) : null}
          <ProfileActionButton
            icon={RotateCcw}
            onPress={openResetModal}
            label={t('profile.freshStart.button')}
          />
          <ProfileActionButton
            icon={UserX}
            onPress={openDeleteModal}
            label={t('profile.deleteAccount.button')}
            tone="danger"
          />
          <ProfileActionButton
            icon={LogOut}
            onPress={() => logout()}
            label={t('profile.logout')}
          />
        </Animated.View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal
        visible={showResetModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowResetModal(false)}
      >
        <KeyboardAwareScrollView
          containerStyle={styles.modalOverlay}
          contentContainerStyle={styles.modalScrollContent}
          keyboardVerticalOffset={12}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.modalContent, { backgroundColor: tokens.bgSheet }]}>
            <View style={[styles.grabber, { backgroundColor: tokens.hairlineStrong }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.fg1 }]}>
                {t('profile.freshStart.title')}
              </Text>
              <Pressable
                onPress={() => setShowResetModal(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <X size={24} color={tokens.fg2} strokeWidth={1.8} />
              </Pressable>
            </View>

            {resetStep === 'info' ? (
              <View style={{ gap: 16 }}>
                <View style={styles.destructiveHero}>
                  <View
                    style={[
                      styles.destructiveHeroCircle,
                      { backgroundColor: `${tokens.statusOverdue}24` },
                    ]}
                  >
                    <RotateCcw size={34} color={tokens.statusOverdue} strokeWidth={1.8} />
                  </View>
                  <Text
                    style={[
                      styles.modalDescription,
                      { color: tokens.fg2, textAlign: 'center' },
                    ]}
                  >
                    {t('profile.freshStart.description')}
                  </Text>
                </View>

                <View
                  style={[
                    styles.freshStartBox,
                    { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
                  ]}
                >
                  <Text style={[styles.boxLabel, { color: tokens.fg3 }]}>
                    {t('profile.freshStart.whatDeleted')}
                  </Text>
                  {deletedItems.map((item) => (
                    <View key={item} style={styles.boxItem}>
                      <X size={14} color={tokens.statusBad} strokeWidth={1.8} />
                      <Text style={[styles.boxItemText, { color: tokens.fg2 }]}>
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>

                <View
                  style={[
                    styles.freshStartBox,
                    { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
                  ]}
                >
                  <Text style={[styles.boxLabel, { color: tokens.fg3 }]}>
                    {t('profile.freshStart.whatPreserved')}
                  </Text>
                  {preservedItems.map((item) => (
                    <View key={item} style={styles.boxItem}>
                      <Check size={14} color={tokens.statusDone} strokeWidth={1.8} />
                      <Text style={[styles.boxItemText, { color: tokens.fg2 }]}>
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.modalActions}>
                  <AmberPillButton
                    label={t('common.continue')}
                    onPress={() => setResetStep('confirm')}
                  />
                  <PillButton
                    variant="ghost"
                    fullWidth
                    onPress={() => setShowResetModal(false)}
                  >
                    {t('common.cancel')}
                  </PillButton>
                </View>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <Text
                  style={[
                    styles.modalDescription,
                    { color: tokens.fg2, textAlign: 'center' },
                  ]}
                >
                  {t('profile.freshStart.confirmInstruction')}
                </Text>
                <AppTextInput
                  style={styles.confirmInput}
                  value={resetConfirmText}
                  onChangeText={setResetConfirmText}
                  placeholder={t('profile.freshStart.confirmPlaceholder')}
                  placeholderTextColor={tokens.fg3}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  textAlign="center"
                />
                {resetError ? (
                  <Text style={[styles.errorTextSmall, { color: tokens.statusBad }]}>
                    {resetError}
                  </Text>
                ) : null}
                <View style={styles.modalActions}>
                  <AmberPillButton
                    label={
                      resetLoading
                        ? t('profile.freshStart.processing')
                        : t('profile.freshStart.confirmButton')
                    }
                    disabled={!isResetConfirmed || resetLoading}
                    onPress={() => {
                      void handleResetAccount()
                    }}
                  />
                  <PillButton
                    variant="ghost"
                    fullWidth
                    disabled={resetLoading}
                    onPress={() => setShowResetModal(false)}
                  >
                    {t('common.cancel')}
                  </PillButton>
                </View>
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      <EditNameSheet open={showEditName} onClose={() => setShowEditName(false)} />

      <TourReplayModal
        visible={showTourReplay}
        onClose={() => setShowTourReplay(false)}
      />

      {showFreshStartAnim && (
        <FreshStartAnimation onComplete={handleFreshStartComplete} />
      )}

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <KeyboardAwareScrollView
          containerStyle={styles.modalOverlay}
          contentContainerStyle={styles.modalScrollContent}
          keyboardVerticalOffset={12}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.modalContent, { backgroundColor: tokens.bgSheet }]}>
            <View style={[styles.grabber, { backgroundColor: tokens.hairlineStrong }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.fg1 }]}>
                {t('profile.deleteAccount.title')}
              </Text>
              <Pressable
                onPress={() => setShowDeleteModal(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <X size={24} color={tokens.fg2} strokeWidth={1.8} />
              </Pressable>
            </View>

            {!isOnline ? (
              <OfflineUnavailableState
                title={t('profile.deleteAccount.offlineTitle')}
                description={t('profile.deleteAccount.offlineDescription')}
                compact
              />
            ) : deleteStep === 'confirm' ? (
              <View style={{ gap: 16 }}>
                <View style={styles.destructiveHero}>
                  <View
                    style={[
                      styles.destructiveHeroCircle,
                      { backgroundColor: `${tokens.statusBad}24` },
                    ]}
                  >
                    <TriangleAlert size={34} color={tokens.statusBad} strokeWidth={1.8} />
                  </View>
                  <View style={styles.destructiveHeroBody}>
                    <Text style={[styles.deleteWarningTitle, { color: tokens.fg1 }]}>
                      {profile?.hasProAccess && profile.planExpiresAt
                        ? t('profile.deleteAccount.warningPro', {
                            date: displayDate(parseISO(profile.planExpiresAt)),
                          })
                        : t('profile.deleteAccount.warningFree')}
                    </Text>
                    <Text style={[styles.deleteWarningDetail, { color: tokens.fg2 }]}>
                      {t('profile.deleteAccount.warningDetail')}
                    </Text>
                  </View>
                </View>
                {deleteError ? (
                  <Text style={[styles.errorTextSmall, { color: tokens.statusBad }]}>
                    {deleteError}
                  </Text>
                ) : null}
                <View style={styles.modalActions}>
                  <DangerPillButton
                    label={
                      deleteLoading
                        ? t('profile.deleteAccount.sending')
                        : t('profile.deleteAccount.sendCode')
                    }
                    disabled={deleteLoading}
                    onPress={() => {
                      void handleRequestDeletion()
                    }}
                  />
                  <PillButton
                    variant="ghost"
                    fullWidth
                    disabled={deleteLoading}
                    onPress={() => setShowDeleteModal(false)}
                  >
                    {t('common.cancel')}
                  </PillButton>
                </View>
              </View>
            ) : deleteStep === 'code' ? (
              <View style={{ gap: 16 }}>
                <Text
                  style={[
                    styles.modalDescription,
                    { color: tokens.fg2, textAlign: 'center' },
                  ]}
                >
                  {t('profile.deleteAccount.codeInstructions')}
                </Text>
                <View style={styles.deleteCodeRow}>
                  {deleteCodeDigits.map((digit, index) => (
                    <AppTextInput
                      key={`digit-${index}`}
                      ref={(node) => {
                        deleteCodeRefs.current[index] = node
                      }}
                      style={styles.deleteCodeInput}
                      value={digit}
                      onChangeText={(text) => setDeleteCodeValue(index, text)}
                      onKeyPress={({ nativeEvent }) =>
                        handleDeleteCodeKeyPress(index, nativeEvent.key)
                      }
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="one-time-code"
                      maxLength={1}
                      placeholder="0"
                      placeholderTextColor={tokens.fg3}
                      textAlign="center"
                    />
                  ))}
                </View>
                {deleteError ? (
                  <Text style={[styles.errorTextSmall, { color: tokens.statusBad }]}>
                    {deleteError}
                  </Text>
                ) : null}
                <View style={styles.modalActions}>
                  <DangerPillButton
                    label={
                      deleteLoading
                        ? t('profile.deleteAccount.deleting')
                        : t('profile.deleteAccount.confirmDelete')
                    }
                    disabled={deleteLoading || deleteCodeDigits.join('').length !== 6}
                    onPress={() => {
                      void handleConfirmDeletion()
                    }}
                  />
                  <PillButton
                    variant="ghost"
                    fullWidth
                    disabled={deleteLoading}
                    onPress={backToDeleteConfirmStep}
                  >
                    {t('common.back')}
                  </PillButton>
                </View>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View
                  style={[
                    styles.freshStartBox,
                    {
                      backgroundColor: tokens.bgCard,
                      borderColor: tokens.hairline,
                      alignItems: 'center',
                    },
                  ]}
                >
                  <Text style={[styles.boxLabel, { color: tokens.statusOverdue }]}>
                    {t('profile.deleteAccount.title')}
                  </Text>
                  <Text
                    style={[
                      styles.boxItemText,
                      { color: tokens.fg2, textAlign: 'center' },
                    ]}
                  >
                    {t('profile.deleteAccount.deactivated', {
                      date: scheduledDeletionDate
                        ? displayDate(parseISO(scheduledDeletionDate))
                        : '',
                    })}
                  </Text>
                </View>
                <View style={styles.modalActions}>
                  <PillButton fullWidth onPress={() => logout()}>
                    {t('profile.logout')}
                  </PillButton>
                </View>
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>
      </Modal>
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
    skeleton: {
      borderRadius: 8,
    },

    statRow: {
      flexDirection: 'row',
      gap: 14,
      paddingHorizontal: 20,
      marginTop: 24,
    },
    statTileWrap: {
      flex: 1,
    },
    statPressable: {
      flexDirection: 'row',
    },
    statPressed: {
      transform: [{ scale: 0.99 }],
      opacity: 0.92,
    },

    groupWrap: {
      paddingHorizontal: 20,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalScrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      paddingTop: 24,
    },
    modalContent: {
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 22,
      paddingTop: 12,
      paddingBottom: 40,
    },
    grabber: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 999,
      marginBottom: 14,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 20,
    },
    modalTitle: {
      flex: 1,
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
    },
    modalDescription: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
    },
    modalActions: {
      gap: 12,
      paddingTop: 8,
    },

    freshStartBox: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 8,
    },
    boxLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
    },
    boxItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    boxItemText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 18,
      flex: 1,
    },

    destructiveHero: {
      alignItems: 'center',
      gap: 16,
      paddingTop: 4,
    },
    destructiveHeroCircle: {
      width: 80,
      height: 80,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    destructiveHeroBody: {
      alignItems: 'center',
    },
    deleteWarningTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    deleteWarningDetail: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      marginTop: 6,
      textAlign: 'center',
    },

    confirmInput: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 16,
    },
    deleteCodeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
    },
    deleteCodeInput: {
      width: 48,
      height: 58,
      borderRadius: 14,
      paddingHorizontal: 0,
      paddingVertical: 0,
      fontFamily: 'Roboto_500Medium',
      fontSize: 26,
    },
    errorTextSmall: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      textAlign: 'center',
    },
  })
}
