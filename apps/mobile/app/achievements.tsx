import { useEffect, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lock } from 'lucide-react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { deriveNextRewardCarrot } from '@orbit/shared/utils'
import { useProfile, useCanViewGamification } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import {
  AchievementCategorySection,
  type AchievementCategoryView,
} from './achievements-sections'
import { NextRewardCarrot } from './(tabs)/profile/_components/next-reward-carrot'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useDateFormat } from '@/hooks/use-date-format'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import { ProgressBar } from '@/components/ui/progress-bar'

type Tokens = ReturnType<typeof createTokensV2>

export default function AchievementsScreen() {
  const { t, i18n } = useTranslation()
  const formatNum = (n: number) => new Intl.NumberFormat(i18n.language).format(n)
  const { displayDate } = useDateFormat()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { profile: accountProfile, isLoading: profileLoading } = useProfile()
  const canViewGamification = useCanViewGamification()
  const { profile, isLoading, isError, refetch, xpProgress, achievementsByCategory } =
    useGamificationProfile(canViewGamification)
  const nextRewardCarrot = deriveNextRewardCarrot(profile, canViewGamification)

  useEffect(() => {
    if (accountProfile && !canViewGamification) {
      router.replace('/upgrade')
    }
  }, [accountProfile, canViewGamification, router])

  const levelSubtitle = profile
    ? `${t('gamification.profileCard.level', { level: profile.level })} · ${profile.levelTitle}`
    : undefined

  const xpLine = profile
    ? t('gamification.profileCard.xp', {
        current: formatNum(profile.totalXp),
        next: formatNum(profile.xpForNextLevel),
      })
    : ''

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
        trailing={<ProBadge />}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!profileLoading && !canViewGamification ? (
          <View style={styles.lockedBlock}>
            <View
              style={[
                styles.lockedIconCircle,
                { backgroundColor: tokens.bgField },
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
            <PillButton
              onPress={() => router.push(buildUpgradeHref('/achievements'))}
              accessibilityLabel={t('gamification.page.upgradeButton')}
              style={styles.upgradeButton}
            >
              {t('gamification.page.upgradeButton')}
            </PillButton>
          </View>
        ) : null}

        {!profileLoading && canViewGamification && isLoading && !profile ? (
          <View style={styles.skeletonStack}>
            <View
              style={[
                styles.skeletonBar,
                { width: 128, height: 32, backgroundColor: tokens.bgCard },
              ]}
            />
            <View
              style={[
                styles.skeletonBar,
                { width: 192, height: 16, backgroundColor: tokens.bgCard },
              ]}
            />
            <View
              style={[
                styles.skeletonBarFull,
                { backgroundColor: tokens.bgCard },
              ]}
            />
          </View>
        ) : null}

        {!profileLoading && canViewGamification && isError && !profile ? (
          <View style={styles.errorBlock}>
            <Text style={[styles.errorText, { color: tokens.fg2 }]}>
              {t('common.error')}
            </Text>
            <PillButton variant="ghost" onPress={() => refetch()}>
              {t('common.retry')}
            </PillButton>
          </View>
        ) : null}

        {canViewGamification && profile ? (
          <>
            <View style={styles.levelBlockWrap}>
              <View
                style={[
                  styles.levelCard,
                  {
                    backgroundColor: tintFromPrimary(tokens, 0.1),
                    borderColor: tintFromPrimary(tokens, 0.28),
                  },
                ]}
              >
                <View style={styles.levelRow}>
                  <Text style={[styles.levelDisplay, { color: tokens.fg1 }]}>
                    {t('gamification.profileCard.level', {
                      level: profile.level,
                    })}
                  </Text>
                  <View style={styles.levelMetaCol}>
                    <Text
                      style={[styles.levelTitle, { color: tokens.fg1 }]}
                      numberOfLines={1}
                    >
                      {profile.levelTitle}
                    </Text>
                    <Text style={[styles.levelMeta, { color: tokens.fg3 }]}>
                      {xpLine}
                    </Text>
                  </View>
                </View>

                <ProgressBar progress={xpProgress / 100} label={xpLine} />

                <View style={styles.xpTotalRow}>
                  <Text style={[styles.earnedCount, { color: tokens.fg3 }]}>
                    {t('gamification.profileCard.totalXp', {
                      total: formatNum(profile.totalXp),
                    })}
                  </Text>
                  <Text style={[styles.earnedCount, { color: tokens.fg3 }]}>
                    {t('gamification.profileCard.earned', {
                      count: profile.achievementsEarned,
                      total: profile.achievementsTotal,
                    })}
                  </Text>
                </View>
              </View>
            </View>

            {achievementsByCategory.map(
              (category: AchievementCategoryView) => (
                <AchievementCategorySection
                  key={category.key}
                  category={category}
                  t={t}
                  tokens={tokens}
                  displayDate={displayDate}
                />
              ),
            )}

            <NextRewardCarrot
              carrot={nextRewardCarrot}
              onUpgrade={() => router.push(buildUpgradeHref('/achievements'))}
            />
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
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      letterSpacing: -0.16,
      textAlign: 'center',
    },
    errorBlock: {
      paddingHorizontal: 24,
      paddingVertical: 64,
      alignItems: 'center',
      gap: 16,
    },
    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
    },
    lockedDescription: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
    },
    upgradeButton: {
      marginTop: 4,
    },
    levelBlockWrap: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 4,
    },
    levelCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 18,
    },
    levelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 12,
    },
    levelDisplay: {
      fontFamily: 'Inter_700Bold',
      fontSize: 36,
      letterSpacing: -0.72,
      fontVariant: ['tabular-nums'],
    },
    levelMetaCol: {
      flex: 1,
      minWidth: 0,
    },
    levelTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
    },
    levelMeta: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    xpTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 10,
    },
    earnedCount: {
      flexShrink: 1,
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
  })
}
