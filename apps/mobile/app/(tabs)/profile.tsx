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

// ---------------------------------------------------------------------------
// Colors (from globals.css design system)
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceGround: '#0d0b16',
  surfaceElevated: '#1a1829',
  surfaceOverlay: '#211f33',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  textInverse: '#07060e',
  red: '#ef4444',
  redLight: '#f87171',
  amber: '#f59e0b',
  amberDark: '#d97706',
  green: '#34d399',
  success: '#34d399',
  blue: '#3b82f6',
}

// ---------------------------------------------------------------------------
// ProfileStreakCard (inline -- matches web ProfileStreakCard)
// ---------------------------------------------------------------------------

function ProfileStreakCard() {
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const router = useRouter()

  const encouragement = useMemo(() => {
    if (streak >= 365) return 'Legendary dedication!'
    if (streak >= 100) return 'Incredible consistency!'
    if (streak >= 30) return 'You are on fire!'
    if (streak >= 14) return 'Two weeks strong!'
    if (streak >= 7) return 'One week down!'
    if (streak >= 1) return 'Keep it going!'
    return ''
  }, [streak])

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
          <Text style={styles.streakLabel}>STREAK</Text>
          {streak > 0 ? (
            <Text style={styles.streakCount}>
              {streak} {streak === 1 ? 'day' : 'days'}
            </Text>
          ) : (
            <Text style={styles.streakEmpty}>Start your streak today!</Text>
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
      Alert.alert('Fresh Start', 'Your account has been reset successfully.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
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
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
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
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  // Subscription card logic
  const isActiveSubscription = profile?.isTrialActive || profile?.hasProAccess

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* Error */}
        {error && (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Failed to load profile'}
          </Text>
        )}

        {/* ==================== ACCOUNT ==================== */}
        <Text style={styles.sectionLabel}>Account</Text>

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
                ? 'Pro Trial'
                : profile?.hasProAccess
                  ? 'Orbit Pro'
                  : trialExpired
                    ? 'Trial Ended'
                    : 'Free Plan'}
            </Text>
            <Text style={styles.subscriptionHint}>
              {profile?.isTrialActive
                ? `${trialDaysLeft ?? 0} ${(trialDaysLeft ?? 0) === 1 ? 'day' : 'days'} left in trial`
                : profile?.hasProAccess
                  ? 'All features unlocked'
                  : trialExpired
                    ? 'Upgrade to unlock all features'
                    : 'Upgrade for more features'}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ==================== NAVIGATION CARDS ==================== */}

        {/* Preferences */}
        <NavCard
          onPress={() => router.push('/preferences')}
          icon={<Settings size={20} color={colors.primary} />}
          title="Preferences"
          hint="Theme, language, notifications"
        />

        {/* AI Features */}
        <NavCard
          onPress={() => router.push('/ai-settings')}
          icon={<Sparkles size={20} color={colors.primary} />}
          title="AI Features"
          hint="Memory, summaries, and more"
        />

        {/* ==================== FEATURES ==================== */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Features</Text>

        {/* Retrospective */}
        <NavCard
          onPress={() => router.push('/retrospective')}
          icon={
            <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 3v18h18" />
              <Path d="M18 9l-5 5-4-4-3 3" />
            </Svg>
          }
          title="Retrospective"
          hint="AI-powered analysis of your habits"
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
          title="Achievements & Level"
          hint={
            profile?.hasProAccess && gamificationProfile
              ? `Level ${gamificationProfile.level} - ${gamificationProfile.totalXp} XP`
              : 'Earn XP and unlock achievements'
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
          title="Google Calendar"
          hint="Sync habits with your calendar"
          variant="primary"
        />

        {/* About & Help */}
        <NavCard
          onPress={() => router.push('/about')}
          icon={<Info size={20} color={colors.primary} />}
          title="About & Help"
          hint="Feature guide, support, privacy"
        />

        {/* Advanced */}
        <NavCard
          onPress={() => router.push('/advanced')}
          icon={<Wrench size={20} color={colors.primary} />}
          title="Advanced"
          hint="Timezone, developer tools"
        />

        {/* ==================== ACCOUNT ACTIONS ==================== */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Account Actions</Text>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => logout()}
          activeOpacity={0.7}
        >
          <LogOut size={16} color={colors.red} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        {/* Fresh Start */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={openResetModal}
          activeOpacity={0.7}
        >
          <RotateCcw size={16} color={colors.primary} />
          <Text style={styles.resetText}>Fresh Start</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={openDeleteModal}
          activeOpacity={0.7}
        >
          <Trash2 size={14} color="rgba(239,68,68,0.6)" />
          <Text style={styles.deleteText}>Delete Account</Text>
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
              <Text style={styles.modalTitle}>Fresh Start</Text>
              <TouchableOpacity onPress={() => setShowResetModal(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {resetStep === 'info' ? (
              <View style={{ gap: 16 }}>
                <Text style={styles.modalDescription}>
                  Start over with a clean slate. This will reset your habits, goals, and chat history while keeping your account settings.
                </Text>

                {/* What gets deleted */}
                <View style={styles.freshStartDeletedBox}>
                  <Text style={styles.freshStartBoxLabel}>WHAT GETS DELETED</Text>
                  {[
                    'All habits and their logs',
                    'All goals and progress',
                    'Chat history',
                    'AI memories about you',
                    'Achievements and XP',
                    'Notifications',
                    'Checklist templates',
                    'Onboarding progress',
                  ].map((item) => (
                    <View key={item} style={styles.freshStartItem}>
                      <X size={14} color={colors.red} />
                      <Text style={styles.freshStartItemText}>{item}</Text>
                    </View>
                  ))}
                </View>

                {/* What stays */}
                <View style={styles.freshStartPreservedBox}>
                  <Text style={styles.freshStartPreservedLabel}>WHAT STAYS</Text>
                  {[
                    'Your account & login',
                    'Your subscription',
                    'Your preferences',
                  ].map((item) => (
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
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <Text style={[styles.modalDescription, { textAlign: 'center' }]}>
                  Type ORBIT to confirm the reset.
                </Text>
                <TextInput
                  style={styles.confirmInput}
                  value={resetConfirmText}
                  onChangeText={setResetConfirmText}
                  placeholder="ORBIT"
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
                    {resetLoading ? 'Processing...' : 'Reset My Account'}
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
              <Text style={styles.modalTitle}>Delete Account</Text>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {deleteStep === 'confirm' ? (
              <View style={{ gap: 16 }}>
                <View style={styles.deleteWarningBox}>
                  <Text style={styles.deleteWarningTitle}>
                    {profile?.hasProAccess
                      ? 'Your Pro subscription will be cancelled.'
                      : 'This action cannot be undone.'}
                  </Text>
                  <Text style={styles.deleteWarningDetail}>
                    Your account will be deactivated immediately and permanently deleted after 30 days. You can cancel deletion by logging in within this period.
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
                    {deleteLoading ? 'Sending...' : 'Send Confirmation Code'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : deleteStep === 'code' ? (
              <View style={{ gap: 16 }}>
                <Text style={[styles.modalDescription, { textAlign: 'center' }]}>
                  Enter the 6-digit code sent to your email.
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
                    {deleteLoading ? 'Deleting...' : 'Confirm Deletion'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View style={styles.deactivatedBox}>
                  <Clock size={20} color={colors.amber} />
                  <Text style={styles.deactivatedTitle}>Account Deactivated</Text>
                  <Text style={styles.deactivatedDetail}>
                    Your account will be permanently deleted in 30 days. Log in again to cancel.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => logout()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryButtonText}>Log Out</Text>
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
