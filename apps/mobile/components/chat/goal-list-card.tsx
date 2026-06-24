import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { formatGoalMetricsDate } from '@orbit/shared/utils'
import type { GoalListCard as GoalListCardData, GoalListCardItem } from '@orbit/shared/types/chat'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

function resolvePercentage(item: GoalListCardItem): number {
  if (item.target <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((item.current / item.target) * 100)))
}

export function GoalListCard({ goalList }: Readonly<{ goalList: GoalListCardData }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens), [tokens])

  if (goalList.items.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>{t('chat.goalList.empty')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      {goalList.items.map((item, index) => {
        const percentage = resolvePercentage(item)
        return (
          <View key={item.id} style={[styles.row, index > 0 && styles.rowDivider]}>
            <View style={styles.headerRow}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.percentage}>
                {t('chat.goalList.percentage', { pct: percentage })}
              </Text>
            </View>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percentage}%` }]} />
            </View>

            <View style={styles.footerRow}>
              <Text style={styles.progress} numberOfLines={1}>
                {t('chat.goalList.progress', {
                  current: item.current,
                  target: item.target,
                  unit: item.unit,
                })}
              </Text>
              {item.deadline ? (
                <Text style={styles.deadline}>
                  {t('chat.goalList.deadline', {
                    date: formatGoalMetricsDate(item.deadline, i18n.language),
                  })}
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    card: {
      marginTop: 8,
      width: '100%',
      borderRadius: 16,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      overflow: 'hidden',
    },
    empty: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
    row: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 6,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg1,
    },
    percentage: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 11,
      color: tokens.primary,
      fontVariant: ['tabular-nums'],
    },
    track: {
      width: '100%',
      height: 4,
      borderRadius: 999,
      backgroundColor: tokens.hairline,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: tokens.primary,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    progress: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    deadline: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      color: tokens.fg3,
    },
  })
}
