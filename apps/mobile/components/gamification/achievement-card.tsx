import { useMemo, useEffect, useRef } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  cancelAnimation,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { Achievement } from '@orbit/shared/types/gamification'
import { createTokensV2, gradients, radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useDateFormat } from '@/hooks/use-date-format'

type AppTokens = ReturnType<typeof createTokensV2>

function rarityColors(
  rarity: string,
  tokens: AppTokens,
): { text: string; bg: string } {
  switch (rarity.toLowerCase()) {
    case 'uncommon':
      return { text: '#34d399', bg: 'rgba(52, 211, 153, 0.10)' }
    case 'rare':
      return { text: '#60a5fa', bg: 'rgba(96, 165, 250, 0.10)' }
    case 'epic':
      return { text: '#c084fc', bg: 'rgba(192, 132, 252, 0.10)' }
    case 'legendary':
      return { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.10)' }
    default:
      return { text: tokens.fg2, bg: tokens.bgElev }
  }
}

interface AchievementCardProps {
  achievement: Achievement
  earned: boolean
  earnedDate: string | null
}

export function AchievementCard({
  achievement,
  earned,
  earnedDate,
}: Readonly<AchievementCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { displayDate } = useDateFormat()
  const styles = useMemo(() => createStyles(tokens, earned), [tokens, earned])
  const rarity = rarityColors(achievement.rarity, tokens)

  const shimmerX = useSharedValue(-1)
  const isFirstMount = useRef(true)

  useEffect(() => {
    if (!earned) return
    if (isFirstMount.current) {
      isFirstMount.current = false
      shimmerX.value = withDelay(
        800,
        withRepeat(
          withTiming(1, { duration: 4000 }),
          -1,
          false,
        ),
      )
    }
    return () => {
      cancelAnimation(shimmerX)
    }
  }, [earned, shimmerX])

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 300 }],
  }))

  return (
    <View
      style={[
        styles.card,
        earned ? styles.cardEarned : styles.cardLocked,
      ]}
    >
      <LinearGradient
        colors={gradients.surfaceSheen}
        locations={gradients.surfaceSheenLocations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={styles.insetHighlight} pointerEvents="none" />
      {earned && (
        <Animated.View style={[styles.shimmerContainer, shimmerStyle]} pointerEvents="none">
          <LinearGradient
            colors={gradients.proShimmer('251,191,36')}
            locations={gradients.proShimmerLocations}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}
      <Text style={styles.icon}>{earned ? '\u2B50' : '\uD83D\uDD12'}</Text>

      <Text style={styles.name}>
        {t(`gamification.achievements.${achievement.id}.name`)}
      </Text>

      <Text style={styles.description}>
        {t(`gamification.achievements.${achievement.id}.description`)}
      </Text>

      <View style={styles.metaRow}>
        <View style={[styles.rarityBadge, { backgroundColor: rarity.bg }]}>
          <Text style={[styles.rarityText, { color: rarity.text }]}>
            {t(`gamification.rarity.${achievement.rarity.toLowerCase()}`)}
          </Text>
        </View>
        <Text style={styles.xpText}>
          {t('gamification.xpReward', { n: achievement.xpReward })}
        </Text>
      </View>

      {earned && earnedDate ? (
        <Text style={styles.earnedDate}>
          {t('gamification.page.earnedOn', {
            date: displayDate(new Date(earnedDate)),
          })}
        </Text>
      ) : null}
    </View>
  )
}

function createStyles(tokens: AppTokens, earned: boolean) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      padding: 16,
      overflow: 'hidden',
      ...(earned
        ? {
            ...shadows.cardParent,
            // Amber glow for unlocked (iOS)
            shadowColor: 'rgba(251,191,36,1)',
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 5,
          }
        : {}),
    },
    cardEarned: {
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.bgElev,
    },
    cardLocked: {
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.hairline,
      opacity: 0.5,
    },
    insetHighlight: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    shimmerContainer: {
      position: 'absolute',
      top: 0,
      left: -300,
      right: -300,
      bottom: 0,
    },
    icon: {
      fontSize: 24,
      marginBottom: 8,
    },
    name: {
      fontSize: 14,
      fontWeight: '700',
      color: tokens.fg1,
    },
    description: {
      fontSize: 11,
      color: tokens.fg2,
      marginTop: 2,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap',
      marginTop: 8,
    },
    rarityBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.lg,
    },
    rarityText: {
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    xpText: {
      fontSize: 10,
      fontWeight: '700',
      color: tokens.primary,
    },
    earnedDate: {
      fontSize: 10,
      color: tokens.fg3,
      marginTop: 4,
    },
  })
}
