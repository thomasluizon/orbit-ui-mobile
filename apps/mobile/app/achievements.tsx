import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, Trophy, Lock } from 'lucide-react-native'
import { useQuery } from '@tanstack/react-query'
import { gamificationKeys } from '@orbit/shared/query'
import type { GamificationProfile, Achievement } from '@orbit/shared/types/gamification'
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
  amber: '#f59e0b',
  green: '#22c55e',
}

function rarityColor(rarity: string): string {
  switch (rarity) {
    case 'Common':
      return colors.textSecondary
    case 'Uncommon':
      return colors.green
    case 'Rare':
      return '#3b82f6'
    case 'Epic':
      return colors.primary
    case 'Legendary':
      return colors.amber
    default:
      return colors.textMuted
  }
}

// ---------------------------------------------------------------------------
// Achievements Screen
// ---------------------------------------------------------------------------

export default function AchievementsScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: gamificationKeys.profile(),
    queryFn: () => apiClient<GamificationProfile>('/api/gamification/profile'),
    staleTime: 5 * 60 * 1000,
  })

  const achievements = data?.achievements ?? []
  const earned = achievements.filter((a) => a.isEarned)
  const locked = achievements.filter((a) => !a.isEarned)

  function renderAchievement({ item }: { item: Achievement }) {
    const color = rarityColor(item.rarity)
    return (
      <View
        style={[
          styles.achievementCard,
          !item.isEarned && styles.achievementLocked,
        ]}
      >
        <View
          style={[
            styles.achievementIcon,
            { backgroundColor: item.isEarned ? `${color}20` : colors.surfaceElevated },
          ]}
        >
          {item.isEarned ? (
            <Trophy size={20} color={color} />
          ) : (
            <Lock size={16} color={colors.textMuted} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.achievementName}>{item.name}</Text>
          <Text style={styles.achievementDesc}>{item.description}</Text>
          <View style={styles.achievementMeta}>
            <Text style={[styles.rarityBadge, { color }]}>{item.rarity}</Text>
            <Text style={styles.xpText}>+{item.xpReward} XP</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Achievements</Text>
      </View>

      {/* Stats summary */}
      {data && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{data.achievementsEarned}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{data.achievementsTotal}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Lv.{data.level}</Text>
            <Text style={styles.statLabel}>{data.levelTitle}</Text>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={[...earned, ...locked]}
          renderItem={renderAchievement}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  achievementCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
    gap: 14,
  },
  achievementLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  achievementDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  achievementMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  rarityBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  xpText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
})
