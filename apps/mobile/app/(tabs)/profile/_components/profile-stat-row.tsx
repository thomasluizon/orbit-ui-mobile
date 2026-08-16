import { type RefObject } from 'react'
import { View, Pressable } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Lock } from '@/components/ui/icons'
import type { ProfileNavItem } from '@orbit/shared/utils/profile-navigation'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { SkeletonLine } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { sectionEntrance } from './profile-section-entrance'
import type { ProfileStyles } from './profile-styles'

type Tokens = ReturnType<typeof createTokensV2>

interface ProfileStatRowProps {
  statsLoading: boolean
  streakValue: string
  streakLabel: string
  achievementsNavItem: ProfileNavItem | undefined
  achievementsTileValue: number
  achievementsLabel: string
  achievementsLocked: boolean
  tokens: Tokens
  styles: ProfileStyles
  streakRef: RefObject<View | null>
  achievementsRef: RefObject<View | null>
  onStreakPress: () => void
  onAchievementsPress: () => void
}

export function ProfileStatRow({
  statsLoading,
  streakValue,
  streakLabel,
  achievementsNavItem,
  achievementsTileValue,
  achievementsLabel,
  achievementsLocked,
  tokens,
  styles,
  streakRef,
  achievementsRef,
  onStreakPress,
  onAchievementsPress,
}: Readonly<ProfileStatRowProps>) {
  const { t } = useTranslation()
  return (
    <Animated.View entering={sectionEntrance(1)} style={styles.statRow}>
      {statsLoading ? (
        <>
          <View style={styles.statTileWrap}>
            <SkeletonLine height={110} style={styles.statSkeleton} />
          </View>
          <View style={styles.statTileWrap}>
            <SkeletonLine height={110} style={styles.statSkeleton} />
          </View>
        </>
      ) : (
        <>
          <View ref={streakRef} collapsable={false} style={styles.statTileWrap}>
            <Pressable
              onPress={onStreakPress}
              accessibilityRole="button"
              accessibilityLabel={`${streakValue} · ${streakLabel}`}
              style={({ pressed }) => [
                styles.statPressable,
                pressed ? styles.statPressed : null,
              ]}
            >
              <StatTile emoji="🔥" value={streakValue} label={streakLabel} />
            </Pressable>
          </View>
          {achievementsNavItem ? (
            <View ref={achievementsRef} collapsable={false} style={styles.statTileWrap}>
              <Pressable
                onPress={onAchievementsPress}
                accessibilityRole="button"
                accessibilityLabel={`${achievementsTileValue} · ${achievementsLabel}${
                  achievementsLocked ? ` · ${t('common.locked')}` : ''
                }`}
                style={({ pressed }) => [
                  styles.statPressable,
                  pressed ? styles.statPressed : null,
                ]}
              >
                <StatTile
                  emoji="🏆"
                  value={achievementsTileValue}
                  label={achievementsLabel}
                />
                {achievementsLocked ? (
                  <View
                    style={[
                      styles.lockBadge,
                      { backgroundColor: tintFromPrimary(tokens, 0.12) },
                    ]}
                  >
                    <Lock size={12} strokeWidth={2} color={tokens.primary} />
                  </View>
                ) : null}
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </Animated.View>
  )
}
