import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, Flame, Snowflake } from 'lucide-react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { gamificationKeys } from '@orbit/shared/query'
import type { StreakInfo, StreakFreezeResponse } from '@orbit/shared/types/gamification'
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
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  orange: '#f97316',
  blue: '#3b82f6',
}

// ---------------------------------------------------------------------------
// Streak Screen
// ---------------------------------------------------------------------------

export default function StreakScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: gamificationKeys.streak(),
    queryFn: () => apiClient<StreakInfo>('/api/gamification/streak'),
    staleTime: 2 * 60 * 1000,
  })

  const freezeMutation = useMutation({
    mutationFn: () =>
      apiClient<StreakFreezeResponse>('/api/gamification/streak/freeze', {
        method: 'POST',
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: gamificationKeys.streak() })
      Alert.alert(
        'Streak Freeze Activated',
        `Your streak is protected for ${res.frozenDate}. ${res.freezesRemainingThisMonth} freezes remaining this month.`,
      )
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to activate freeze.'
      Alert.alert('Error', msg)
    },
  })

  function handleActivateFreeze() {
    Alert.alert(
      'Activate Streak Freeze',
      'This will protect your streak for today. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Activate', onPress: () => freezeMutation.mutate() },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Streak</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : data ? (
          <>
            {/* Streak display */}
            <View style={styles.streakHero}>
              <Flame size={48} color={colors.orange} />
              <Text style={styles.streakCount}>{data.currentStreak}</Text>
              <Text style={styles.streakLabel}>Day Streak</Text>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.longestStreak}</Text>
                <Text style={styles.statLabel}>Longest</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {data.lastActiveDate ?? 'N/A'}
                </Text>
                <Text style={styles.statLabel}>Last Active</Text>
              </View>
            </View>

            {/* Freeze section */}
            <View style={styles.freezeCard}>
              <View style={styles.freezeHeader}>
                <Snowflake size={20} color={colors.blue} />
                <Text style={styles.freezeTitle}>Streak Freezes</Text>
              </View>
              <Text style={styles.freezeDescription}>
                Protect your streak when you miss a day. You have{' '}
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                  {data.freezesAvailable}
                </Text>{' '}
                freezes available ({data.freezesUsedThisMonth}/
                {data.maxFreezesPerMonth} used this month).
              </Text>

              {data.isFrozenToday && (
                <View style={styles.frozenBadge}>
                  <Snowflake size={14} color={colors.blue} />
                  <Text style={styles.frozenBadgeText}>
                    Streak is frozen today
                  </Text>
                </View>
              )}

              {!data.isFrozenToday && data.freezesAvailable > 0 && (
                <TouchableOpacity
                  style={styles.freezeButton}
                  onPress={handleActivateFreeze}
                  disabled={freezeMutation.isPending}
                  activeOpacity={0.8}
                >
                  <Snowflake size={16} color="#fff" />
                  <Text style={styles.freezeButtonText}>
                    {freezeMutation.isPending
                      ? 'Activating...'
                      : 'Activate Freeze'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Recent freeze dates */}
              {data.recentFreezeDates.length > 0 && (
                <View style={styles.recentFreezes}>
                  <Text style={styles.recentLabel}>Recent freezes:</Text>
                  {data.recentFreezeDates.map((d) => (
                    <Text key={d} style={styles.recentDate}>
                      {d}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>Failed to load streak data.</Text>
        )}
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  loadingContainer: { alignItems: 'center', paddingVertical: 60 },
  streakHero: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  streakCount: {
    fontSize: 64,
    fontWeight: '800',
    color: colors.orange,
    lineHeight: 72,
  },
  streakLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  freezeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  freezeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freezeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  freezeDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  frozenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.blue}15`,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  frozenBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.blue,
  },
  freezeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingVertical: 14,
  },
  freezeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  recentFreezes: {
    paddingTop: 4,
    gap: 4,
  },
  recentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  recentDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 40,
  },
})
