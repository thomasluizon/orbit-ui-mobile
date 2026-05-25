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
  type TextInput,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { parseISO } from 'date-fns'
import { API } from '@orbit/shared/api'
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
import { Flame, User as UserIcon, X, Check } from 'lucide-react-native'
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
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
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
import { TourReplayModal } from '@/components/tour/tour-replay-modal'

type Tokens = ReturnType<typeof createTokensV2>

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
  const featureNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'features',
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

  async function handleRequestDeletion() {
    if (!isOnline) {
      setDeleteError(t('calendarSync.notConnected'))
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
      setDeleteError(t('calendarSync.notConnected'))
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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <AppBar
        LeadingIcon={UserIcon}
        title={t('profile.title')}
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
            {error instanceof Error ? error.message : t('errors.loadProfile')}
          </Text>
        ) : null}

        <View style={styles.userBlock}>
          {isLoading ? (
            <>
              <View
                style={[styles.skeleton, { width: 200, height: 22, backgroundColor: tokens.bgElev }]}
              />
              <View
                style={[styles.skeleton, { width: 260, height: 14, backgroundColor: tokens.bgElev }]}
              />
            </>
          ) : (
            <View style={styles.userRow}>
              <View style={[styles.avatar, { backgroundColor: tokens.bgElev }]}>
                <Text style={[styles.avatarText, { color: tokens.fg1 }]}>
                  {profile?.name
                    ? profile.name
                        .split(' ')
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                    : '?'}
                </Text>
              </View>
              <View style={styles.userTexts}>
                <Text style={[styles.userName, { color: tokens.fg1 }]}>
                  {profile?.name}
                </Text>
                <Text style={[styles.userEmail, { color: tokens.fg3 }]}>
                  {profile?.email}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View ref={streakRef} collapsable={false} style={styles.groupWrap}>
          <SettingsGroup>
            <SettingsGroupRow
              icon={<Flame size={18} color={tokens.statusBad} strokeWidth={1.75} />}
              label={t('streakDisplay.title')}
              onPress={handleStreakPress}
              trailing={
                <View style={styles.streakTrailing}>
                  <Text style={[styles.streakCount, { color: tokens.fg1 }]}>
                    {streak}
                  </Text>
                  <Text style={[styles.streakDays, { color: tokens.fg3 }]}>
                    {plural(t('streakDisplay.daysSuffix'), streak)}
                  </Text>
                </View>
              }
            />
          </SettingsGroup>
        </View>

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
                  icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg3} />}
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

        <SectionLabel>{t('profile.sections.features')}</SectionLabel>
        <View style={styles.groupWrap}>
          <SettingsGroup>
            <SettingsGroupRow
              label={t('tour.replay.title')}
              hint={t('tour.replay.hint')}
              onPress={() => setShowTourReplay(true)}
            />
            {featureNavItems.map((item) => (
              <View
                key={item.id}
                ref={
                  item.id === 'retrospective'
                    ? retroRef
                    : item.id === 'achievements'
                      ? achievementsRef
                      : undefined
                }
                collapsable={false}
              >
                <SettingsGroupRow
                  icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg3} />}
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

        <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
        <View ref={subscriptionRef} collapsable={false} style={styles.groupWrap}>
          <SettingsGroup>
            <SettingsGroupRow
              label={subscriptionLabel}
              hint={subscriptionHint}
              onPress={() => router.push(buildUpgradeHref('/profile'))}
            />
          </SettingsGroup>
        </View>

        <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
        <ProfileActionButton
          onPress={() => logout()}
          label={t('profile.logout')}
          tone="danger"
        />
        <ProfileActionButton
          onPress={openResetModal}
          label={t('profile.freshStart.button')}
          tone="primary"
        />
        <ProfileActionButton
          onPress={openDeleteModal}
          label={t('profile.deleteAccount.button')}
          tone="danger"
          compact
        />

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
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: tokens.bgElev,
                borderTopColor: tokens.hairlineStrong,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.fg1 }]}>
                {t('profile.freshStart.title')}
              </Text>
              <Pressable onPress={() => setShowResetModal(false)} hitSlop={8}>
                <X size={20} color={tokens.fg3} />
              </Pressable>
            </View>

            {resetStep === 'info' ? (
              <View style={{ gap: 16 }}>
                <Text style={[styles.modalDescription, { color: tokens.fg2 }]}>
                  {t('profile.freshStart.description')}
                </Text>

                <View
                  style={[
                    styles.freshStartBox,
                    { borderColor: tokens.hairlineStrong },
                  ]}
                >
                  <Text style={[styles.boxLabel, { color: tokens.fg3 }]}>
                    {t('profile.freshStart.whatDeleted')}
                  </Text>
                  {deletedItems.map((item) => (
                    <View key={item} style={styles.boxItem}>
                      <X size={14} color={tokens.statusBad} />
                      <Text style={[styles.boxItemText, { color: tokens.fg2 }]}>
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>

                <View
                  style={[
                    styles.freshStartBox,
                    { borderColor: tokens.hairlineStrong },
                  ]}
                >
                  <Text style={[styles.boxLabel, { color: tokens.fg3 }]}>
                    {t('profile.freshStart.whatPreserved')}
                  </Text>
                  {preservedItems.map((item) => (
                    <View key={item} style={styles.boxItem}>
                      <Check size={14} color={tokens.statusDone} />
                      <Text style={[styles.boxItemText, { color: tokens.fg2 }]}>
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={() => setResetStep('confirm')}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: pressed
                        ? tokens.primaryPressed
                        : tokens.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: tokens.fgOnPrimary },
                    ]}
                  >
                    {t('common.continue')}
                  </Text>
                </Pressable>
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
                  style={[
                    styles.confirmInput,
                    {
                      backgroundColor: tokens.bgSunk,
                      color: tokens.fg1,
                      borderColor: tokens.hairlineStrong,
                    },
                  ]}
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
                <Pressable
                  onPress={handleResetAccount}
                  disabled={!isResetConfirmed || resetLoading}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: pressed
                        ? tokens.primaryPressed
                        : tokens.primary,
                    },
                    (!isResetConfirmed || resetLoading) && styles.buttonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: tokens.fgOnPrimary },
                    ]}
                  >
                    {resetLoading
                      ? t('profile.freshStart.processing')
                      : t('profile.freshStart.confirmButton')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>
      </Modal>

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
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: tokens.bgElev,
                borderTopColor: tokens.hairlineStrong,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.fg1 }]}>
                {t('profile.deleteAccount.title')}
              </Text>
              <Pressable onPress={() => setShowDeleteModal(false)} hitSlop={8}>
                <X size={20} color={tokens.fg3} />
              </Pressable>
            </View>

            {!isOnline ? (
              <OfflineUnavailableState
                title={t('calendarSync.notConnected')}
                description={`${t('profile.deleteAccount.sendCode')} / ${t('profile.deleteAccount.confirmDelete')}`}
                compact
              />
            ) : deleteStep === 'confirm' ? (
              <View style={{ gap: 16 }}>
                <View
                  style={[
                    styles.freshStartBox,
                    { borderColor: tokens.hairlineStrong },
                  ]}
                >
                  <Text style={[styles.boxLabel, { color: tokens.statusBad }]}>
                    {profile?.hasProAccess
                      ? t('profile.deleteAccount.warningPro', {
                          date: profile.planExpiresAt
                            ? displayDate(parseISO(profile.planExpiresAt))
                            : '',
                        })
                      : t('profile.deleteAccount.warningFree')}
                  </Text>
                  <Text style={[styles.boxItemText, { color: tokens.fg3 }]}>
                    {t('profile.deleteAccount.warningDetail')}
                  </Text>
                </View>
                {deleteError ? (
                  <Text style={[styles.errorTextSmall, { color: tokens.statusBad }]}>
                    {deleteError}
                  </Text>
                ) : null}
                <Pressable
                  onPress={handleRequestDeletion}
                  disabled={deleteLoading}
                  style={({ pressed }) => [
                    styles.dangerButton,
                    {
                      backgroundColor: pressed
                        ? `${tokens.statusBad}cc`
                        : tokens.statusBad,
                    },
                    deleteLoading && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.dangerButtonText}>
                    {deleteLoading
                      ? t('profile.deleteAccount.sending')
                      : t('profile.deleteAccount.sendCode')}
                  </Text>
                </Pressable>
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
                      style={[
                        styles.deleteCodeInput,
                        {
                          backgroundColor: tokens.bgSunk,
                          color: tokens.fg1,
                          borderColor: tokens.hairlineStrong,
                        },
                      ]}
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
                <Pressable
                  onPress={handleConfirmDeletion}
                  disabled={deleteLoading || deleteCodeDigits.join('').length !== 6}
                  style={({ pressed }) => [
                    styles.dangerButton,
                    {
                      backgroundColor: pressed
                        ? `${tokens.statusBad}cc`
                        : tokens.statusBad,
                    },
                    (deleteLoading || deleteCodeDigits.join('').length !== 6) &&
                      styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.dangerButtonText}>
                    {deleteLoading
                      ? t('profile.deleteAccount.deleting')
                      : t('profile.deleteAccount.confirmDelete')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View
                  style={[
                    styles.freshStartBox,
                    {
                      borderColor: tokens.hairlineStrong,
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
                <Pressable
                  onPress={() => logout()}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    {
                      backgroundColor: pressed ? tokens.bgSunk : tokens.bgElev,
                      borderColor: tokens.hairlineStrong,
                    },
                  ]}
                >
                  <Text style={[styles.secondaryButtonText, { color: tokens.fg1 }]}>
                    {t('profile.logout')}
                  </Text>
                </Pressable>
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
      fontFamily: 'Geist',
      fontSize: 13,
      textAlign: 'center',
      marginVertical: 12,
    },

    userBlock: {
      paddingHorizontal: 20,
      paddingVertical: 18,
      gap: 8,
    },
    groupWrap: {
      paddingHorizontal: 20,
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: 'Geist',
      fontSize: 16,
      fontWeight: '600',
    },
    userTexts: {
      flex: 1,
      gap: 2,
    },
    userName: {
      fontFamily: 'Geist',
      fontSize: 17,
      fontWeight: '600',
    },
    userEmail: {
      fontFamily: 'Geist',
      fontSize: 13,
    },
    skeleton: {
      borderRadius: 4,
    },

    streakTrailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    streakCount: {
      fontFamily: 'GeistMono',
      fontSize: 16,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    streakDays: {
      fontFamily: 'Geist',
      fontSize: 13,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.58)',
      justifyContent: 'flex-end',
    },
    modalScrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      paddingTop: 24,
    },
    modalContent: {
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      padding: 24,
      paddingBottom: 40,
      maxHeight: '88%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    modalTitle: {
      fontFamily: 'Geist',
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.17,
    },
    modalDescription: {
      fontFamily: 'Geist',
      fontSize: 14,
      lineHeight: 21,
    },

    freshStartBox: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      padding: 16,
      gap: 8,
    },
    boxLabel: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.55,
    },
    boxItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    boxItemText: {
      fontFamily: 'Geist',
      fontSize: 13,
      flex: 1,
    },

    primaryButton: {
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '500',
    },
    dangerButton: {
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
    },
    dangerButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '500',
      color: '#ffffff',
    },
    secondaryButton: {
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
    },
    secondaryButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '500',
    },
    buttonDisabled: { opacity: 0.5 },

    confirmInput: {
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontFamily: 'GeistMono',
      fontSize: 16,
      fontWeight: '500',
      borderWidth: StyleSheet.hairlineWidth,
    },
    deleteCodeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    deleteCodeInput: {
      width: 44,
      height: 52,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      fontFamily: 'GeistMono',
      fontSize: 18,
      fontWeight: '500',
    },
    errorTextSmall: {
      fontFamily: 'Geist',
      fontSize: 12,
      textAlign: 'center',
    },
  })
}
