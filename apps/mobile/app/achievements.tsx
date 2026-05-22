import { useEffect, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lock } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import {
  AchievementCategorySection,
  type AchievementCategoryView,
} from './achievements-sections'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'

type Tokens = ReturnType<typeof createTokensV2>

// ---------------------------------------------------------------------------
// Achievements Screen — v8 Linear-tactical chrome
// Level card · rarity-glyph rows per category · trailing "Locked / Earned"
// ---------------------------------------------------------------------------

export default function AchievementsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { profile: accountProfile, isLoading: profileLoading } = useProfile()
  const hasProAccess = useHasProAccess()
  const { profile, isLoading, xpProgress, achievementsByCategory } =
    useGamificationProfile(hasProAccess)

  useEffect(() => {
    if (accountProfile && !hasProAccess) {
      router.replace('/upgrade')
    }
  }, [accountProfile, hasProAccess, router])

  const levelSubtitle = profile
    ? `${t('gamification.profileCard.level', { level: profile.level })} · ${profile.levelTitle}`
    : undefined

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('gamification.title')}
        subtitle={levelSubtitle}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!profileLoading && !hasProAccess ? (
          <View style={styles.lockedBlock}>
            <View
              style={[
                styles.lockedIconCircle,
                { backgroundColor: tokens.bgSunk },
              ]}
            >
              <Lock size={28} color={tokens.fg3} strokeWidth={1.4} />
            </View>
            <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
              {t('gamification.page.lockedTitle')}
            </Text>
            <Text style={[styles.lockedDescription, { color: tokens.fg3 }]}>
              {t('gamification.page.lockedDescription')}
            </Text>
            <Pressable
              onPress={() => router.push(buildUpgradeHref('/achievements'))}
              accessibilityRole="button"
              accessibilityLabel={t('gamification.page.upgradeButton')}
              style={({ pressed }) => [
                styles.upgradeButton,
                {
                  backgroundColor: pressed
                    ? tokens.primaryPressed
                    : tokens.primary,
                },
              ]}
            >
              <Text
                style={[styles.upgradeButtonText, { color: tokens.fgOnPrimary }]}
              >
                {t('gamification.page.upgradeButton')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!profileLoading && hasProAccess && isLoading && !profile ? (
          <View style={styles.skeletonStack}>
            <View
              style={[
                styles.skeletonBar,
                { width: 128, height: 32, backgroundColor: tokens.bgSunk },
              ]}
            />
            <View
              style={[
                styles.skeletonBar,
                { width: 192, height: 16, backgroundColor: tokens.bgSunk },
              ]}
            />
            <View
              style={[
                styles.skeletonBarFull,
                { backgroundColor: tokens.bgSunk },
              ]}
            />
          </View>
        ) : null}

        {hasProAccess && profile ? (
          <>
            {/* Level card — mono number + xp track */}
            <View
              style={[
                styles.levelBlock,
                { borderBottomColor: tokens.hairline },
              ]}
            >
              <View style={styles.levelRow}>
                <View>
                  <Text style={[styles.levelEyebrow, { color: tokens.fg3 }]}>
                    {t('gamification.profileCard.level', {
                      level: profile.level,
                    }).toUpperCase()}
                  </Text>
                  <Text style={[styles.levelNumber, { color: tokens.fg1 }]}>
                    {profile.level}
                  </Text>
                </View>
                <View style={styles.levelMetaCol}>
                  <Text
                    style={[styles.levelTitle, { color: tokens.fg1 }]}
                    numberOfLines={1}
                  >
                    {profile.levelTitle}
                  </Text>
                  <Text style={[styles.levelMeta, { color: tokens.fg3 }]}>
                    {t('gamification.profileCard.xp', {
                      current: profile.totalXp.toLocaleString(),
                      next: profile.xpForNextLevel.toLocaleString(),
                    })}
                  </Text>
                </View>
              </View>

              <View
                style={[styles.xpTrack, { backgroundColor: tokens.bgSunk }]}
              >
                <View
                  style={[
                    styles.xpFill,
                    {
                      width: `${xpProgress}%`,
                      backgroundColor: tokens.primary,
                    },
                  ]}
                />
              </View>

              <Text style={[styles.earnedCount, { color: tokens.fg3 }]}>
                {t('gamification.profileCard.earned', {
                  count: profile.achievementsEarned,
                  total: profile.achievementsTotal,
                })}
              </Text>
            </View>

            {achievementsByCategory.map(
              (category: AchievementCategoryView) => (
                <AchievementCategorySection
                  key={category.key}
                  category={category}
                  t={t}
                  tokens={tokens}
                />
              ),
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(_tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: {
      paddingBottom: 40,
    },
    skeletonStack: {
      paddingHorizontal: 20,
      paddingTop: 16,
      gap: 12,
    },
    skeletonBar: {
      borderRadius: 4,
    },
    skeletonBarFull: {
      height: 10,
      borderRadius: 999,
      width: '100%',
    },
    lockedBlock: {
      paddingHorizontal: 24,
      paddingVertical: 40,
      alignItems: 'center',
      gap: 14,
    },
    lockedIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lockedTitle: {
      fontFamily: 'Geist',
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.17,
      textAlign: 'center',
    },
    lockedDescription: {
      fontFamily: 'Geist',
      fontSize: 14,
      lineHeight: 22,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    upgradeButton: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 8,
      marginTop: 4,
    },
    upgradeButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
    },
    levelBlock: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 20,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    levelRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 16,
    },
    levelEyebrow: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.66,
    },
    levelNumber: {
      fontFamily: 'GeistMono',
      fontSize: 56,
      fontWeight: '500',
      letterSpacing: -2,
      lineHeight: 56,
      fontVariant: ['tabular-nums'],
    },
    levelMetaCol: {
      flex: 1,
      paddingBottom: 6,
    },
    levelTitle: {
      fontFamily: 'Geist',
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.17,
    },
    levelMeta: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      marginTop: 4,
    },
    xpTrack: {
      height: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    xpFill: {
      height: '100%',
      borderRadius: 999,
    },
    earnedCount: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
  })
}
