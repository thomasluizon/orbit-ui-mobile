import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useTourTarget } from '@/hooks/use-tour-target'
import { useTourScrollContainer } from '@/hooks/use-tour-scroll-container'
import {
  View,
  Text,
  TouchableOpacity,
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
import { format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
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
import {
  LogOut,
  RotateCcw,
  Trash2,
  ChevronRight,
  Clock,
  BadgeCheck,
  Sparkles as SparklesIcon,
  X,
  Check,
  Compass,
} from 'lucide-react-native'
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { useProfile, useTrialDaysLeft, useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { apiClient } from '@/lib/api-client'
import { clearChecklistTemplates } from '@/lib/checklist-template-storage'
import { buildQueuedMutation, createQueuedAck, isQueuedResult, queueOrExecute } from '@/lib/offline-mutations'
import * as offlineQueue from '@/lib/offline-queue'
import { clearPersistedQueryCache } from '@/lib/query-client'
import { useOffline } from '@/hooks/use-offline'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { AppTextInput } from '@/components/ui/app-text-input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { useAppTheme } from '@/lib/use-app-theme'
import { createColors } from '@/lib/theme'
import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'
import { plural } from '@/lib/plural'
import { ProfileNavCard } from './profile/_components/profile-nav-card'
import { ProfileActionButton } from './profile/_components/profile-action-button'
import { ProfileNavIcon } from './profile/_components/profile-nav-icon'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'

// ---------------------------------------------------------------------------
// ProfileStreakCard (inline -- matches web ProfileStreakCard)
// ---------------------------------------------------------------------------

function ProfileStreakCard() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const router = useRouter()
  const styles = useMemo(() => createStyles(colors), [colors])
  const streakRef = useRef<View>(null)
  useTourTarget('tour-profile-streak', streakRef)

  const encouragement = useMemo(() => {
    if (streak >= 365) return t('streakDisplay.profile.encouragement365')
    if (streak >= 100) return t('streakDisplay.profile.encouragement100')
    if (streak >= 30) return t('streakDisplay.profile.encouragement30')
    if (streak >= 14) return t('streakDisplay.profile.encouragement14')
    if (streak >= 7) return t('streakDisplay.profile.encouragement7')
    if (streak >= 1) return t('streakDisplay.profile.encouragement1')
    return ''
  }, [streak, t])

  return (
    <TouchableOpacity
      ref={streakRef}
      style={styles.streakCard}
      onPress={() => router.push('/streak')}
      activeOpacity={0.7}
    >
      <View style={styles.streakCardInner}>
        {/* Flame */}
        <View style={styles.streakFlameContainer}>
          {streak > 0 ? (
            <Svg viewBox="0 0 40 50" width={44} height={44}>
              <Defs>
                <LinearGradient id="profileFlameGrad" x1="20" y1="0" x2="20" y2="50" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor="#fbbf24" />
                  <Stop offset="0.5" stopColor="#f97316" />
                  <Stop offset="1" stopColor="#ef4444" />
                </LinearGradient>
              </Defs>
              <Path
                d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                fill="url(#profileFlameGrad)"
              />
            </Svg>
          ) : (
            <View style={styles.streakFlameEmpty}>
              <Svg viewBox="0 0 40 50" width={28} height={28}>
                <Path
                  d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                  fill={colors.textMuted}
                  opacity={0.3}
                />
              </Svg>
            </View>
          )}
        </View>

        {/* Streak info */}
        <View style={{ flex: 1 }}>
          <Text style={styles.streakLabel}>{t('streakDisplay.profile.title').toUpperCase()}</Text>
          {streak > 0 ? (
            <Text style={styles.streakCount}>
              {plural(t('streakDisplay.profile.currentStreak', { count: streak }), streak)}
            </Text>
          ) : (
            <Text style={styles.streakEmpty}>{t('streakDisplay.profile.noStreak')}</Text>
          )}
          {encouragement && streak > 0 ? (
            <Text style={styles.streakEncouragement}>{encouragement}</Text>
          ) : null}
        </View>

        {/* Chevron */}
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Profile Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const { colors } = useAppTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { subscription } = useLocalSearchParams<{ subscription?: string | string[] }>()
  const { profile, isLoading, error } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialExpired = useTrialExpired()
  const logout = useAuthStore((s) => s.logout)
  const { profile: gamificationProfile } = useGamificationProfile(profile?.hasProAccess ?? false)
  const { isOnline } = useOffline()
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS
  const styles = useMemo(() => createStyles(colors), [colors])
  const subscriptionRef = useRef<View>(null)
  const preferencesRef = useRef<View>(null)
  const retroRef = useRef<View>(null)
  const achievementsRef = useRef<View>(null)
  useTourTarget('tour-profile-subscription', subscriptionRef)
  useTourTarget('tour-profile-preferences', preferencesRef)
  useTourTarget('tour-profile-retrospective', retroRef)
  useTourTarget('tour-profile-achievements', achievementsRef)
  const profileScrollRef = useRef<ScrollView>(null)
  const profileScrollTo = useCallback((y: number) => {
    profileScrollRef.current?.scrollTo({ y, animated: true })
  }, [])
  const { onTourScroll: onProfileTourScroll } = useTourScrollContainer('/profile', profileScrollTo)
  const accountNavItems = PROFILE_NAV_ITEMS.filter((item) => item.section === 'account')
  const featureNavItems = PROFILE_NAV_ITEMS.filter((item) => item.section === 'features')

  const getNavHint = (item: ProfileNavItem): string => {
    if (
      item.hintMode === 'gamificationProfile' &&
      profile?.hasProAccess &&
      gamificationProfile
    ) {
      return `${t('gamification.profileCard.level', { level: gamificationProfile.level })} · ${t('gamification.profileCard.totalXp', { total: gamificationProfile.totalXp })}`
    }
    return t(item.hintKey)
  }

  // --- Fresh Start ---
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
  // --- Delete Account ---
  const [showTourReplay, setShowTourReplay] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [deleteCodeDigits, setDeleteCodeDigits] = useState(['', '', '', '', '', ''])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState<string | null>(null)
  const deleteCodeRefs = useRef<Array<TextInput | null>>([])

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
      const response = await apiClient<{ scheduledDeletionAt?: string | null }>(API.auth.confirmDeletion, {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setScheduledDeletionDate(response.scheduledDeletionAt ?? null)
      setDeleteStep('deactivated')
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('profile.deleteAccount.errorGeneric'))
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  // Subscription card logic
  const isActiveSubscription = profile?.isTrialActive || profile?.hasProAccess

  // Deleted items for Fresh Start
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

  const handleNavPress = useCallback((item: ProfileNavItem) => {
    if (shouldRedirectProfileNavItem(item, profile)) {
      router.push('/upgrade')
      return
    }

    router.push(item.route as Href)
  }, [profile, router])

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={profileScrollRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onProfileTourScroll}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile.title')}</Text>
          <ThemeToggle />
        </View>

        {/* Error */}
        {error && (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : t('errors.loadProfile')}
          </Text>
        )}

        {/* ==================== ACCOUNT ==================== */}
        <Text style={styles.sectionLabel}>{t('profile.sections.account')}</Text>

        <View style={styles.cardStack}>
        {/* User info card */}
        <View style={styles.card}>
          {isLoading ? (
            <View style={{ gap: 8 }}>
              <View style={[styles.skeleton, { width: 192, height: 24 }]} />
              <View style={[styles.skeleton, { width: 256, height: 16 }]} />
            </View>
          ) : (
            <View>
              <Text style={styles.userName}>{profile?.name}</Text>
              <Text style={styles.userEmail}>{profile?.email}</Text>
            </View>
          )}
        </View>

        {/* Streak display */}
        <ProfileStreakCard />

        {/* Subscription */}
        <TouchableOpacity
          ref={subscriptionRef}
          style={[
            styles.subscriptionCard,
            isActiveSubscription
              ? styles.subscriptionActive
              : styles.subscriptionInactive,
          ]}
          onPress={() => router.push('/upgrade')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.subscriptionIcon,
              isActiveSubscription
                ? styles.subscriptionIconActive
                : styles.subscriptionIconInactive,
            ]}
          >
            {profile?.isTrialActive ? (
              <Clock size={20} color={isActiveSubscription ? colors.primary : colors.amber} />
            ) : profile?.hasProAccess ? (
              <BadgeCheck size={20} color={isActiveSubscription ? colors.primary : colors.amber} />
            ) : (
              <SparklesIcon size={20} color={isActiveSubscription ? colors.primary : colors.amber} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subscriptionTitle}>
              {profile?.isTrialActive
                ? t('profile.subscription.trial')
                : profile?.hasProAccess
                  ? t('profile.subscription.pro')
                  : trialExpired
                    ? t('profile.subscription.trialEnded')
                    : t('profile.subscription.free')}
            </Text>
            <Text style={styles.subscriptionHint}>
              {profile?.isTrialActive
                ? plural(t('profile.subscription.trialDaysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)
                : profile?.hasProAccess
                  ? t('profile.subscription.proHint')
                  : trialExpired
                    ? t('profile.subscription.trialEndedHint')
                    : t('profile.subscription.freeHint')}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ==================== NAVIGATION CARDS ==================== */}

        {accountNavItems.map((item) => (
          <View key={item.id} ref={item.id === 'preferences' ? preferencesRef : undefined}>
            <ProfileNavCard
              colors={colors}
              onPress={() => handleNavPress(item)}
              icon={<ProfileNavIcon iconKey={item.iconKey} color={colors.primary} />}
              title={t(item.titleKey)}
              hint={getNavHint(item)}
              proBadgeLabel={t('common.proBadge')}
            />
          </View>
        ))}
        </View>

        {/* ==================== FEATURES ==================== */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>{t('profile.sections.features')}</Text>

        <View style={styles.cardStack}>
        <ProfileNavCard
          colors={colors}
          onPress={() => setShowTourReplay(true)}
          icon={<Compass size={20} color={colors.primary} />}
          title={t('tour.replay.title')}
          hint={t('tour.replay.hint')}
        />
        {featureNavItems.map((item) => (
          <View
            key={item.id}
            ref={
              item.id === 'retrospective' ? retroRef
              : item.id === 'achievements' ? achievementsRef
              : undefined
            }
          >
            <ProfileNavCard
              colors={colors}
              onPress={() => handleNavPress(item)}
              icon={<ProfileNavIcon iconKey={item.iconKey} color={colors.primary} />}
              title={t(item.titleKey)}
              hint={getNavHint(item)}
              variant={item.variant}
            proBadge={item.proBadge}
            proBadgeLabel={t('common.proBadge')}
          />
          </View>
        ))}
        </View>

        {/* ==================== ACCOUNT ACTIONS ==================== */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>{t('profile.sections.accountActions')}</Text>

        <View style={styles.cardStack}>
        {/* Logout */}
        <ProfileActionButton
          colors={colors}
          onPress={() => logout()}
          icon={<LogOut size={16} color={colors.red} />}
          label={t('profile.logout')}
          tone="danger"
        />

        {/* Fresh Start */}
        <ProfileActionButton
          colors={colors}
          onPress={openResetModal}
          icon={<RotateCcw size={16} color={colors.primary} />}
          label={t('profile.freshStart.button')}
          tone="primary"
        />

        {/* Delete Account */}
        <ProfileActionButton
          colors={colors}
          onPress={openDeleteModal}
          icon={<Trash2 size={14} color="rgba(239,68,68,0.6)" />}
          label={t('profile.deleteAccount.button')}
          tone="danger"
          compact
        />
        </View>
      </ScrollView>

      {/* Fresh Start Modal */}
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.freshStart.title')}</Text>
              <TouchableOpacity onPress={() => setShowResetModal(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {resetStep === 'info' ? (
              <View style={{ gap: 16 }}>
                <Text style={styles.modalDescription}>
                  {t('profile.freshStart.description')}
                </Text>

                <View style={styles.freshStartDeletedBox}>
                  <Text style={styles.freshStartBoxLabel}>{t('profile.freshStart.whatDeleted')}</Text>
                  {deletedItems.map((item) => (
                    <View key={item} style={styles.freshStartItem}>
                      <X size={14} color={colors.red} />
                      <Text style={styles.freshStartItemText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.freshStartPreservedBox}>
                  <Text style={styles.freshStartPreservedLabel}>{t('profile.freshStart.whatPreserved')}</Text>
                  {preservedItems.map((item) => (
                    <View key={item} style={styles.freshStartItem}>
                      <Check size={14} color={colors.success} />
                      <Text style={styles.freshStartItemText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setResetStep('confirm')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>{t('common.continue')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <Text style={[styles.modalDescription, { textAlign: 'center' }]}>
                  {t('profile.freshStart.confirmInstruction')}
                </Text>
                <AppTextInput
                  style={styles.confirmInput}
                  value={resetConfirmText}
                  onChangeText={setResetConfirmText}
                  placeholder={t('profile.freshStart.confirmPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  textAlign="center"
                />
                {resetError ? (
                  <Text style={styles.errorTextSmall}>{resetError}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryButton, (!isResetConfirmed || resetLoading) && styles.buttonDisabled]}
                  onPress={handleResetAccount}
                  disabled={!isResetConfirmed || resetLoading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>
                    {resetLoading ? t('profile.freshStart.processing') : t('profile.freshStart.confirmButton')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      {/* Tour Replay Modal */}
      <TourReplayModal visible={showTourReplay} onClose={() => setShowTourReplay(false)} />

      {/* Fresh Start Animation */}
      {showFreshStartAnim && (
        <FreshStartAnimation onComplete={handleFreshStartComplete} />
      )}

      {/* Delete Account Modal */}
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.deleteAccount.title')}</Text>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {!isOnline ? (
              <OfflineUnavailableState
                title={t('calendarSync.notConnected')}
                description={`${t('profile.deleteAccount.sendCode')} / ${t('profile.deleteAccount.confirmDelete')}`}
                compact
              />
            ) : deleteStep === 'confirm' ? (
              <View style={{ gap: 16 }}>
                <View style={styles.deleteWarningBox}>
                  <Text style={styles.deleteWarningTitle}>
                    {profile?.hasProAccess
                      ? t('profile.deleteAccount.warningPro', {
                          date: profile.planExpiresAt
                            ? format(parseISO(profile.planExpiresAt), 'PPP', { locale: dateFnsLocale })
                            : '',
                        })
                      : t('profile.deleteAccount.warningFree')}
                  </Text>
                  <Text style={styles.deleteWarningDetail}>
                    {t('profile.deleteAccount.warningDetail')}
                  </Text>
                </View>
                {deleteError ? <Text style={styles.errorTextSmall}>{deleteError}</Text> : null}
                <TouchableOpacity
                  style={[styles.dangerButton, deleteLoading && styles.buttonDisabled]}
                  onPress={handleRequestDeletion}
                  disabled={deleteLoading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dangerButtonText}>
                    {deleteLoading ? t('profile.deleteAccount.sending') : t('profile.deleteAccount.sendCode')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : deleteStep === 'code' ? (
              <View style={{ gap: 16 }}>
                <Text style={[styles.modalDescription, { textAlign: 'center' }]}>
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
                      onKeyPress={({ nativeEvent }) => handleDeleteCodeKeyPress(index, nativeEvent.key)}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="one-time-code"
                      maxLength={1}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      textAlign="center"
                    />
                  ))}
                </View>
                {deleteError ? <Text style={styles.errorTextSmall}>{deleteError}</Text> : null}
                <TouchableOpacity
                  style={[styles.dangerButton, (deleteLoading || deleteCodeDigits.join('').length !== 6) && styles.buttonDisabled]}
                  onPress={handleConfirmDeletion}
                  disabled={deleteLoading || deleteCodeDigits.join('').length !== 6}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dangerButtonText}>
                    {deleteLoading ? t('profile.deleteAccount.deleting') : t('profile.deleteAccount.confirmDelete')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View style={styles.deactivatedBox}>
                  <Clock size={20} color={colors.amber} />
                  <Text style={styles.deactivatedTitle}>{t('profile.deleteAccount.title')}</Text>
                  <Text style={styles.deactivatedDetail}>
                    {t('profile.deleteAccount.deactivated', {
                      date: scheduledDeletionDate
                        ? format(parseISO(scheduledDeletionDate), 'PPP', { locale: dateFnsLocale })
                        : '',
                    })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => logout()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryButtonText}>{t('profile.logout')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>
      </Modal>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof createColors>) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  // Header
  header: { paddingTop: 32, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },

  // Error
  errorText: { fontSize: 13, color: colors.red, textAlign: 'center', marginBottom: 16 },

  // Section labels
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 12,
  },

  // Card (user info, etc.)
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
  },
  skeleton: { backgroundColor: colors.surfaceElevated, borderRadius: 8 },
  userName: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  userEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },

  // Streak card
  streakCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
  },
  streakCardInner: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  streakFlameContainer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  streakFlameEmpty: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.textMuted, marginBottom: 2 },
  streakCount: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  streakEmpty: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  streakEncouragement: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Subscription
  subscriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  cardStack: {
    gap: 12,
  },
  subscriptionActive: {
    backgroundColor: colors.primary_10,
    borderWidth: 1,
    borderColor: colors.primary_20,
  },
  subscriptionInactive: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.20)',
  },
  subscriptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionIconActive: { backgroundColor: colors.primary_20 },
  subscriptionIconInactive: { backgroundColor: 'rgba(245,158,11,0.20)' },
  subscriptionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  subscriptionHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  modalDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  // Fresh Start boxes
  freshStartDeletedBox: {
    borderWidth: 1,
    borderColor: colors.primary_20,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  freshStartBoxLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 1, marginBottom: 4 },
  freshStartPreservedBox: {
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.20)',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  freshStartPreservedLabel: { fontSize: 11, fontWeight: '700', color: colors.success, letterSpacing: 1, marginBottom: 4 },
  freshStartItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  freshStartItemText: { fontSize: 12, color: colors.textSecondary, flex: 1 },

  // Delete warning
  deleteWarningBox: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  deleteWarningTitle: { fontSize: 14, fontWeight: '700', color: colors.red },
  deleteWarningDetail: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },

  // Deactivated
  deactivatedBox: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.20)',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    alignItems: 'center',
  },
  deactivatedTitle: { fontSize: 14, fontWeight: '700', color: colors.amber },
  deactivatedDetail: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, textAlign: 'center' },

  // Buttons
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  dangerButton: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  buttonDisabled: { opacity: 0.5 },

  // Confirm input
  confirmInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteCodeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  deleteCodeInput: {
    width: 44,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorTextSmall: { fontSize: 12, color: colors.red, textAlign: 'center' },
  })
}
