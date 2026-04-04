import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
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
  Flame,
} from 'lucide-react-native'
import { useProfile, useTrialDaysLeft, useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#22c55e',
}

// ---------------------------------------------------------------------------
// NavCard component
// ---------------------------------------------------------------------------

function NavCard({
  onPress,
  icon,
  title,
  hint,
}: {
  onPress: () => void
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <TouchableOpacity
      style={styles.navCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.navCardIcon}>{icon}</View>
      <View style={styles.navCardContent}>
        <Text style={styles.navCardTitle}>{title}</Text>
        <Text style={styles.navCardHint}>{hint}</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
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

  // Fresh Start modal state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const isResetConfirmed = resetConfirmText.trim().toUpperCase() === 'ORBIT'

  async function handleResetAccount() {
    if (!isResetConfirmed) return
    setResetLoading(true)
    try {
      await apiClient('/api/profile/reset', { method: 'POST' })
      setShowResetConfirm(false)
      setResetConfirmText('')
      Alert.alert('Done', 'Your account has been reset.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      Alert.alert('Error', msg)
    } finally {
      setResetLoading(false)
    }
  }

  function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ])
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data after 30 days. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient('/api/auth/request-deletion', { method: 'POST' })
              Alert.alert('Confirmation Sent', 'Check your email for a confirmation code.')
            } catch {
              Alert.alert('Error', 'Failed to request account deletion.')
            }
          },
        },
      ],
    )
  }

  // Subscription card styling
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

        {/* User info */}
        <View style={styles.card}>
          {isLoading ? (
            <View style={{ gap: 8 }}>
              <View style={styles.skeleton} />
              <View style={[styles.skeleton, { width: 200 }]} />
            </View>
          ) : (
            <View>
              <Text style={styles.userName}>{profile?.name}</Text>
              <Text style={styles.userEmail}>{profile?.email}</Text>
            </View>
          )}
        </View>

        {/* Streak */}
        <View style={styles.card}>
          <View style={styles.streakRow}>
            <View style={styles.streakIcon}>
              <Flame size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakText}>
                {profile?.currentStreak ?? 0} day streak
              </Text>
              <Text style={styles.streakSub}>
                {profile?.streakFreezesAvailable ?? 0} streak freezes available
              </Text>
            </View>
          </View>
        </View>

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
              <Clock size={20} color={colors.primary} />
            ) : profile?.hasProAccess ? (
              <BadgeCheck size={20} color={colors.primary} />
            ) : (
              <Sparkles size={20} color={colors.amber} />
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
                ? `${trialDaysLeft} days left in trial`
                : profile?.hasProAccess
                  ? 'All features unlocked'
                  : trialExpired
                    ? 'Upgrade to unlock all features'
                    : 'Upgrade for more features'}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ==================== NAVIGATION ==================== */}
        <NavCard
          onPress={() => router.push('/preferences')}
          icon={<Settings size={20} color={colors.primary} />}
          title="Preferences"
          hint="Theme, language, notifications"
        />
        <NavCard
          onPress={() => router.push('/ai-settings')}
          icon={<Sparkles size={20} color={colors.primary} />}
          title="AI Features"
          hint="Memory, summaries, and more"
        />
        <NavCard
          onPress={() => router.push('/about')}
          icon={<Info size={20} color={colors.primary} />}
          title="About & Help"
          hint="Feature guide, support, privacy"
        />
        <NavCard
          onPress={() => router.push('/advanced')}
          icon={<Wrench size={20} color={colors.primary} />}
          title="Advanced"
          hint="Timezone, developer tools"
        />

        {/* ==================== ACCOUNT ACTIONS ==================== */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
          Account Actions
        </Text>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <LogOut size={16} color={colors.red} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        {/* Fresh Start */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => {
            setShowResetConfirm(true)
            setResetConfirmText('')
          }}
          activeOpacity={0.7}
        >
          <RotateCcw size={16} color={colors.primary} />
          <Text style={styles.resetText}>Fresh Start</Text>
        </TouchableOpacity>

        {/* Fresh Start confirmation */}
        {showResetConfirm && (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmInfo}>
              Type ORBIT to confirm. This will delete all habits, goals, and chat history but keep your account.
            </Text>
            <TextInput
              style={styles.confirmInput}
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
              placeholder="ORBIT"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowResetConfirm(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  !isResetConfirmed && styles.confirmBtnDisabled,
                ]}
                onPress={handleResetAccount}
                disabled={!isResetConfirmed || resetLoading}
              >
                <Text style={styles.confirmBtnText}>
                  {resetLoading ? 'Processing...' : 'Reset My Account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Delete Account */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
        >
          <Trash2 size={14} color="rgba(239,68,68,0.6)" />
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  errorText: {
    fontSize: 13,
    color: colors.red,
    textAlign: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 8,
  },
  skeleton: {
    height: 20,
    width: 160,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streakIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  streakSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  subscriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
    gap: 16,
  },
  subscriptionActive: {
    backgroundColor: `${colors.primary}15`,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  subscriptionInactive: {
    backgroundColor: `${colors.amber}15`,
    borderWidth: 1,
    borderColor: `${colors.amber}30`,
  },
  subscriptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionIconActive: {
    backgroundColor: `${colors.primary}25`,
  },
  subscriptionIconInactive: {
    backgroundColor: `${colors.amber}25`,
  },
  subscriptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subscriptionHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 8,
    gap: 16,
  },
  navCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCardContent: {
    flex: 1,
  },
  navCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  navCardHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    marginBottom: 8,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.red,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
    marginBottom: 8,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  confirmInfo: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  confirmInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginBottom: 8,
  },
  deleteText: {
    fontSize: 12,
    color: 'rgba(239,68,68,0.6)',
  },
})
