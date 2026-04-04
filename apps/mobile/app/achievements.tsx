import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, Lock } from 'lucide-react-native'
import { format } from 'date-fns'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'

// ---------------------------------------------------------------------------
// Colors (from globals.css design system)
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceGround: '#0d0b16',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  amber: '#fbbf24',
  emerald: '#34d399',
  blue: '#60a5fa',
  purple: '#c084fc',
}

function rarityColor(rarity: string): { text: string; bg: string } {
  switch (rarity.toLowerCase()) {
    case 'uncommon':
      return { text: '#34d399', bg: 'rgba(52,211,153,0.10)' }
    case 'rare':
      return { text: '#60a5fa', bg: 'rgba(96,165,250,0.10)' }
    case 'epic':
      return { text: '#c084fc', bg: 'rgba(192,132,252,0.10)' }
    case 'legendary':
      return { text: '#fbbf24', bg: 'rgba(251,191,36,0.10)' }
    default:
      return { text: colors.textSecondary, bg: colors.surfaceElevated }
  }
}

// ---------------------------------------------------------------------------
// Achievements Screen
// ---------------------------------------------------------------------------

export default function AchievementsScreen() {
  const router = useRouter()
  const { profile: userProfile, isLoading: profileLoading } = useProfile()
  const hasProAccess = useHasProAccess()
  const {
    profile,
    isLoading,
    xpProgress,
    achievementsByCategory,
  } = useGamificationProfile()

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
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Achievements</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>
        </View>

        {/* Locked state for non-Pro users */}
        {!profileLoading && !hasProAccess ? (
          <View style={styles.lockedCard}>
            <View style={styles.lockedIconCircle}>
              <Lock size={32} color={colors.primary} />
            </View>
            <Text style={styles.lockedTitle}>Achievements Locked</Text>
            <Text style={styles.lockedDescription}>
              Upgrade to Pro to unlock achievements, earn XP, and level up.
            </Text>
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => router.push('/upgrade')}
              activeOpacity={0.8}
            >
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Loading state */}
            {isLoading && !profile ? (
              <View style={styles.loadingCard}>
                <View style={[styles.skeletonBar, { width: 128, height: 32 }]} />
                <View style={[styles.skeletonBar, { width: 192, height: 16 }]} />
                <View style={[styles.skeletonBar, { width: '100%', height: 10, borderRadius: 999 }]} />
              </View>
            ) : profile ? (
              <>
                {/* Level header section */}
                <View style={styles.levelCard}>
                  <View style={styles.levelRow}>
                    <View style={styles.levelCircle}>
                      <Text style={styles.levelNumber}>{profile.level}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.levelTitle}>{profile.levelTitle}</Text>
                      <Text style={styles.levelSubtitle}>Level {profile.level}</Text>
                    </View>
                  </View>

                  {/* XP progress bar */}
                  <View style={{ gap: 6 }}>
                    <View style={styles.xpBarTrack}>
                      <View
                        style={[styles.xpBarFill, { width: `${xpProgress}%` }]}
                      />
                    </View>
                    <View style={styles.xpTextRow}>
                      <Text style={styles.xpText}>
                        {profile.totalXp.toLocaleString()} / {profile.xpForNextLevel.toLocaleString()} XP
                      </Text>
                      <Text style={styles.xpTotal}>
                        {profile.totalXp.toLocaleString()} total
                      </Text>
                    </View>
                  </View>

                  {/* Earned count */}
                  <Text style={styles.earnedCount}>
                    {profile.achievementsEarned} of {profile.achievementsTotal} earned
                  </Text>
                </View>

                {/* Achievement grid by category */}
                {achievementsByCategory.map((category) => (
                  <View key={category.key} style={styles.categorySection}>
                    <Text style={styles.categoryLabel}>
                      {category.key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
                    </Text>
                    <View style={styles.achievementGrid}>
                      {category.items.map((achievement) => {
                        const earned = achievement.isEarned
                        const rarity = rarityColor(achievement.rarity)
                        return (
                          <View
                            key={achievement.id}
                            style={[
                              styles.achievementCard,
                              earned
                                ? styles.achievementCardEarned
                                : styles.achievementCardLocked,
                            ]}
                          >
                            <Text style={styles.achievementEmoji}>
                              {earned ? '\u2B50' : '\uD83D\uDD12'}
                            </Text>
                            <Text style={styles.achievementName}>
                              {achievement.name}
                            </Text>
                            <Text style={styles.achievementDesc}>
                              {achievement.description}
                            </Text>
                            <View style={styles.achievementMeta}>
                              <View style={[styles.rarityBadge, { backgroundColor: rarity.bg }]}>
                                <Text style={[styles.rarityText, { color: rarity.text }]}>
                                  {achievement.rarity}
                                </Text>
                              </View>
                              <Text style={styles.xpReward}>+{achievement.xpReward} XP</Text>
                            </View>
                            {earned && achievement.earnedAtUtc ? (
                              <Text style={styles.earnedDate}>
                                {format(new Date(achievement.earnedAtUtc), 'MMM d, yyyy')}
                              </Text>
                            ) : null}
                          </View>
                        )
                      })}
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </>
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
    paddingTop: 32,
    paddingBottom: 24,
  },
  backButton: { padding: 8, marginLeft: -8, borderRadius: 999 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  proBadge: {
    backgroundColor: 'rgba(139,92,246,0.20)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Locked state
  lockedCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  lockedIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139,92,246,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  lockedDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  upgradeButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Loading
  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  skeletonBar: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
  },

  // Level card
  levelCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  levelCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139,92,246,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  levelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  levelSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // XP bar
  xpBarTrack: {
    height: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 999,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  xpTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  xpText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  xpTotal: {
    fontSize: 10,
    color: colors.textMuted,
  },
  earnedCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Category section
  categorySection: {
    marginTop: 24,
    gap: 12,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  achievementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  // Achievement card
  achievementCard: {
    borderRadius: 16,
    padding: 16,
    width: '48%',
    gap: 4,
  },
  achievementCardEarned: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.20)',
  },
  achievementCardLocked: {
    backgroundColor: colors.surfaceGround,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    opacity: 0.5,
  },
  achievementEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  achievementName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  achievementDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  achievementMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  rarityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rarityText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  xpReward: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  earnedDate: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
  },
})
