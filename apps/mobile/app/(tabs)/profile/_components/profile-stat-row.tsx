import { type RefObject } from 'react'
import { View, Pressable } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { sectionEntrance } from '@/components/profile/profile-section-entrance'
import type { ProfileStyles } from './profile-styles'

interface ProfileStatRowProps {
  statsLoading: boolean
  streakValue: string
  streakLabel: string
  styles: ProfileStyles
  streakRef: RefObject<View | null>
  onStreakPress: () => void
}

export function ProfileStatRow({
  statsLoading,
  streakValue,
  streakLabel,
  styles,
  streakRef,
  onStreakPress,
}: Readonly<ProfileStatRowProps>) {
  const { t } = useTranslation()
  return (
    <Animated.View entering={sectionEntrance(1)} style={styles.statRow}>
      {statsLoading ? (
        <>
          <View style={styles.statTileWrap}>
            <Skeleton variant="stat-tile" label={t('common.loading')} />
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
              <StatTile  value={streakValue} label={streakLabel} />
            </Pressable>
          </View>
        </>
      )}
    </Animated.View>
  )
}
