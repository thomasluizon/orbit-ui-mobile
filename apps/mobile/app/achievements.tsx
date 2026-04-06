import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Lock } from 'lucide-react-native'
import { createColors } from '@/lib/theme'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { AchievementCard } from '@/components/gamification/achievement-card'
import { useAppTheme } from '@/lib/use-app-theme'

type AppColors = ReturnType<typeof createColors>

export default function AchievementsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { isLoading: profileLoading } = useProfile()
  const hasProAccess = useHasProAccess()
  const {
    profile,
    isLoading,
    xpProgress,
    achievementsByCategory,
  } = useGamificationProfile()

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{t('gamification.title')}</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>{t('common.proBadge').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {!profileLoading && !hasProAccess ? (
          <View style={styles.lockedCard}>
            <View style={styles.lockedIconCircle}>
              <Lock size={32} color={colors.primary} />
            </View>
            <Text style={styles.lockedTitle}>{t('gamification.page.lockedTitle')}</Text>
            <Text style={styles.lockedDescription}>
              {t('gamification.page.lockedDescription')}
            </Text>
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => router.push('/upgrade')}
              activeOpacity={0.8}
            >
              <Text style={styles.upgradeButtonText}>{t('gamification.page.upgradeButton')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {isLoading && !profile ? (
              <View style={styles.loadingCard}>
                <View style={[styles.skeletonBar, { width: 128, height: 32 }]} />
                <View style={[styles.skeletonBar, { width: 192, height: 16 }]} />
                <View style={[styles.skeletonBar, { width: '100%', height: 10, borderRadius: 999 }]} />
              </View>
            ) : null}

            {profile ? (
              <>
                <View style={styles.levelCard}>
                  <View style={styles.levelRow}>
                    <View style={styles.levelCircle}>
                      <Text style={styles.levelNumber}>{profile.level}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.levelTitle}>{profile.levelTitle}</Text>
                      <Text style={styles.levelSubtitle}>
                        {t('gamification.profileCard.level', { level: profile.level })}
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <View style={styles.xpBarTrack}>
                      <View style={[styles.xpBarFill, { width: `${xpProgress}%` }]} />
                    </View>
                    <View style={styles.xpTextRow}>
                      <Text style={styles.xpText}>
                        {t('gamification.profileCard.xp', {
                          current: profile.totalXp.toLocaleString(),
                          next: profile.xpForNextLevel.toLocaleString(),
                        })}
                      </Text>
                      <Text style={styles.xpTotal}>
                        {t('gamification.profileCard.totalXp', {
                          total: profile.totalXp.toLocaleString(),
                        })}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.earnedCount}>
                    {t('gamification.profileCard.earned', {
                      count: profile.achievementsEarned,
                      total: profile.achievementsTotal,
                    })}
                  </Text>
                </View>

                {achievementsByCategory.map((category) => (
                  <View key={category.key} style={styles.categorySection}>
                    <Text style={styles.categoryLabel}>
                      {t(`gamification.categories.${category.key}`).toUpperCase()}
                    </Text>
                    <View style={styles.achievementGrid}>
                      {category.items.map((achievement) => (
                        <View key={achievement.id} style={styles.achievementItem}>
                          <AchievementCard
                            achievement={achievement}
                            earned={achievement.isEarned}
                            earnedDate={achievement.earnedAtUtc}
                          />
                        </View>
                      ))}
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

function createStyles(colors: AppColors) {
  return StyleSheet.create({
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
      backgroundColor: colors.primary_20,
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
      backgroundColor: colors.primary_20,
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
      backgroundColor: colors.primary_20,
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
      flexDirection: 'column',
      gap: 12,
    },
    achievementItem: {
      width: '100%',
    },
  })
}
