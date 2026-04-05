import { useState, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Modal,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  Settings,
  Sparkles,
  Info,
  Wrench,
  LogOut,
  RotateCcw,
  Trash2,
  ChevronRight,
  Clock,
  BadgeCheck,
  X,
  Check,
} from 'lucide-react-native'
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { useProfile, useTrialDaysLeft, useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { apiClient } from '@/lib/api-client'
import { colors } from '@/lib/theme'

// ---------------------------------------------------------------------------
// ProfileStreakCard (inline -- matches web ProfileStreakCard)
// ---------------------------------------------------------------------------

function ProfileStreakCard() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const router = useRouter()

  const encouragement = useMemo(() => {
    if (streak >= 365) return t('streak.profile.encouragement365')
    if (streak >= 100) return t('streak.profile.encouragement100')
    if (streak >= 30) return t('streak.profile.encouragement30')
    if (streak >= 14) return t('streak.profile.encouragement14')
    if (streak >= 7) return t('streak.profile.encouragement7')
    if (streak >= 1) return t('streak.profile.encouragement1')
    return ''
  }, [streak, t])

  return (
    <TouchableOpacity
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
          <Text style={styles.streakLabel}>{t('streak.detail.currentStreak').toUpperCase()}</Text>
          {streak > 0 ? (
            <Text style={styles.streakCount}>
              {t('streak.profile.currentStreak', { count: streak })}
            </Text>
          ) : (
            <Text style={styles.streakEmpty}>{t('streak.profile.noStreak')}</Text>
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
// NavCard (matches web nav card pattern)
// ---------------------------------------------------------------------------

function NavCard({
  onPress,
  icon,
  title,
  hint,
  variant = 'default',
  proBadge = false,
  rightText,
}: {
  onPress: () => void
  icon: React.ReactNode
  title: string
  hint: string
  variant?: 'default' | 'primary'
  proBadge?: boolean
  rightText?: string
}) {
  const isPrimary = variant === 'primary'
  return (
    <TouchableOpacity
      style={[
        styles.navCard,
        isPrimary && styles.navCardPrimary,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.navCardIcon, isPrimary && styles.navCardIconPrimary]}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.navCardTitleRow}>
          <Text style={styles.navCardTitle}>{title}</Text>
          {proBadge && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>
        {rightText ? (
          <Text style={styles.navCardHint}>{rightText}</Text>
        ) : (
          <Text style={styles.navCardHint}>{hint}</Text>
        )}
      </View>
      <ChevronRight size={16} color={isPrimary ? colors.textMuted : colors.textMuted} />
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Profile Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile, isLoading, error } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialExpired = useTrialExpired()
  const logout = useAuthStore((s) => s.logout)
  const { profile: gamificationProfile } = useGamificationProfile()

  // --- Fresh Start ---
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
      await apiClient('/api/profile/reset', { method: 'POST' })
      setShowResetModal(false)
      Alert.alert(t('profile.freshStart.title'), t('profile.freshStart.successTitle'))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('profile.freshStart.errorGeneric')
      setResetError(msg)
    } finally {
      setResetLoading(false)
    }
  }

  // --- Delete Account ---
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  function openDeleteModal() {
    setDeleteStep('confirm')
    setDeleteCode('')
    setDeleteError('')
    setDeleteLoading(false)
    setShowDeleteModal(true)
  }

  async function handleRequestDeletion() {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await apiClient('/api/auth/request-deletion', { method: 'POST' })
      setDeleteStep('code')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('profile.deleteAccount.errorGeneric')
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleConfirmDeletion() {
    if (deleteCode.length !== 6) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await apiClient('/api/auth/confirm-deletion', {
        method: 'POST',
        body: JSON.stringify({ code: deleteCode }),
      })
      setDeleteStep('deactivated')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('profile.deleteAccount.errorGeneric')
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  // Subscription card logic
  const isActiveSubscription = profile?.isTrialActive || profile?.hasProAccess

  // Deleted items for Fresh Start
  const deletedItems = [
    t('profile.freshStart.deleteHabits'),
    t('profile.freshStart.deleteGoals'),
    t('profile.freshStart.deleteChat'),
    t('profile.freshStart.deleteUserFacts'),
    t('profile.freshStart.deleteAchievements'),
    t('profile.freshStart.deleteNotifications'),
    t('profile.freshStart.deleteChecklist'),
    t('profile.freshStart.deleteOnboarding'),
  ]

  const preservedItems = [
    t('profile.freshStart.preserveAccount'),
    t('profile.freshStart.preserveSubscription'),
    t('profile.freshStart.preservePreferences'),
  ]

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile.title')}</Text>
        </View>

        {/* Error */}
        {error && (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : t('common.error')}
          </Text>
        )}

        {/* ==================== ACCOUNT ==================== */}
        <Text style={styles.sectionLabel}>{t('profile.sections.account')}</Text>

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
              <Sparkles size={20} color={isActiveSubscription ? colors.primary : colors.amber} />
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
                ? t('profile.subscription.trialDaysLeft', { days: trialDaysLeft ?? 0 })
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

        {/* Preferences */}
        <NavCard
          onPress={() => router.push('/preferences')}
          icon={<Settings size={20} color={colors.primary} />}
          title={t('profile.sections.preferences')}
          hint={t('profile.sections.preferencesHint')}
        />

        {/* AI Features */}
        <NavCard
          onPress={() => router.push('/ai-settings')}
          icon={<Sparkles size={20} color={colors.primary} />}
          title={t('profile.sections.aiFeatures')}
          hint={t('profile.sections.aiFeaturesHint')}
        />

        {/* ==================== FEATURES ==================== */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>{t('profile.sections.features')}</Text>

        {/* Retrospective */}
        <NavCard
          onPress={() => router.push('/retrospective')}
          icon={
            <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 3v18h18" />
              <Path d="M18 9l-5 5-4-4-3 3" />
            </Svg>
          }
          title={t('profile.retrospectiveTitle')}
          hint={t('profile.retrospectiveHint')}
          variant="primary"
          proBadge
        />

        {/* Achievements & Level */}
        <NavCard
          onPress={() => router.push('/achievements')}
          icon={
            <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 8 9 8" />
              <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 15 8 15 8" />
              <Path d="M4 22h16" />
              <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </Svg>
          }
          title={t('gamification.title')}
          hint={
            profile?.hasProAccess && gamificationProfile
              ? `Level ${gamificationProfile.level} - ${gamificationProfile.totalXp} XP`
              : t('profile.retrospectiveHint')
          }
          variant="primary"
          proBadge
        />

        {/* Google Calendar Sync */}
        <NavCard
          onPress={() => router.push('/calendar-sync')}
          icon={
            <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M8 2v4" />
              <Path d="M16 2v4" />
              <Rect width={18} height={18} x={3} y={4} rx={2} />
              <Path d="M3 10h18" />
            </Svg>
          }
          title={t('calendar.profileButton')}
          hint={t('calendar.profileHint')}
          variant="primary"
        />

        {/* About & Help */}
        <NavCard
          onPress={() => router.push('/about')}
          icon={<Info size={20} color={colors.primary} />}
          title={t('profile.sections.aboutHelp')}
          hint={t('profile.sections.aboutHelpHint')}
        />

        {/* Advanced */}
        <NavCard
          onPress={() => router.push('/advanced')}
          icon={<Wrench size={20} color={colors.primary} />}
          title={t('profile.sections.advanced')}
          hint={t('profile.sections.advancedHint')}
        />

        {/* ==================== ACCOUNT ACTIONS ==================== */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>{t('profile.sections.accountActions')}</Text>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => logout()}
          activeOpacity={0.7}
        >
          <LogOut size={16} color={colors.red} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>

        {/* Fresh Start */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={openResetModal}
          activeOpacity={0.7}
        >
          <RotateCcw size={16} color={colors.primary} />
          <Text style={styles.resetText}>{t('profile.freshStart.button')}</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={openDeleteModal}
          activeOpacity={0.7}
        >
          <Trash2 size={14} color="rgba(239,68,68,0.6)" />
          <Text style={styles.deleteText}>{t('profile.deleteAccount.button')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fresh Start Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
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

                {/* What gets deleted */}
                <View style={styles.freshStartDeletedBox}>
                  <Text style={styles.freshStartBoxLabel}>{t('profile.freshStart.whatDeleted')}</Text>
                  {deletedItems.map((item) => (
                    <View key={item} style={styles.freshStartItem}>
                      <X size={14} color={colors.red} />
                      <Text style={styles.freshStartItemText}>{item}</Text>
                    </View>
                  ))}
                </View>

                {/* What stays */}
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
                <TextInput
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
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.deleteAccount.title')}</Text>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {deleteStep === 'confirm' ? (
              <View style={{ gap: 16 }}>
                <View style={styles.deleteWarningBox}>
                  <Text style={styles.deleteWarningTitle}>
                    {profile?.hasProAccess
                      ? t('profile.deleteAccount.warningPro', { date: '' })
                      : t('profile.deleteAccount.warning')}
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
                <TextInput
                  style={styles.confirmInput}
                  value={deleteCode}
                  onChangeText={(text) => setDeleteCode(text.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  textAlign="center"
                />
                {deleteError ? <Text style={styles.errorTextSmall}>{deleteError}</Text> : null}
                <TouchableOpacity
                  style={[styles.dangerButton, (deleteLoading || deleteCode.length !== 6) && styles.buttonDisabled]}
                  onPress={handleConfirmDeletion}
                  disabled={deleteLoading || deleteCode.length !== 6}
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
                    {t('profile.deleteAccount.warningFree')}
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
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
    marginBottom: 8,
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
    marginBottom: 8,
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
    marginBottom: 8,
    gap: 16,
  },
  subscriptionActive: {
    backgroundColor: 'rgba(139,92,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.20)',
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
  subscriptionIconActive: { backgroundColor: 'rgba(139,92,246,0.20)' },
  subscriptionIconInactive: { backgroundColor: 'rgba(245,158,11,0.20)' },
  subscriptionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  subscriptionHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Nav cards
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
    marginBottom: 8,
    gap: 16,
  },
  navCardPrimary: {
    backgroundColor: 'rgba(139,92,246,0.10)',
    borderColor: 'rgba(139,92,246,0.20)',
  },
  navCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(139,92,246,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCardIconPrimary: {
    backgroundColor: 'rgba(139,92,246,0.20)',
  },
  navCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navCardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  navCardHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Pro badge
  proBadge: {
    backgroundColor: 'rgba(139,92,246,0.20)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  proBadgeText: { fontSize: 9, fontWeight: '700', color: colors.primary, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Account action buttons
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    marginBottom: 8,
  },
  logoutText: { fontSize: 14, fontWeight: '700', color: colors.red },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.30)',
    marginBottom: 8,
  },
  resetText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginBottom: 8,
  },
  deleteText: { fontSize: 12, color: 'rgba(239,68,68,0.6)' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
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
    borderColor: 'rgba(139,92,246,0.20)',
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
  errorTextSmall: { fontSize: 12, color: colors.red, textAlign: 'center' },
})
