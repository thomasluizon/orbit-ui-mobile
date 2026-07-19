import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type {
  HabitListCard as HabitListCardData,
  HabitListCardStatus,
} from '@orbit/shared/types/chat'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const STATUS_LABEL_KEYS: Record<HabitListCardStatus, string | null> = {
  today: 'chat.habitList.today',
  overdue: 'chat.habitList.overdue',
  general: 'chat.habitList.general',
  none: null,
}

type AppTokens = ReturnType<typeof createTokensV2>

function resolveAccent(tokens: AppTokens, status: HabitListCardStatus, isBadHabit: boolean): string {
  if (isBadHabit || status === 'overdue') return tokens.statusBad
  if (status === 'today') return tokens.primary
  return tokens.fg3
}

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens), [tokens])

  if (habitList.items.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>{t('chat.habitList.empty')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      {habitList.items.map((item, index) => {
        const labelKey = STATUS_LABEL_KEYS[item.status]
        const accent = resolveAccent(tokens, item.status, item.isBadHabit)
        return (
          <View
            key={item.id}
            style={[styles.row, index > 0 && styles.rowDivider, { paddingLeft: 14 + item.depth * 16 }]}
          >
            {item.emoji ? (
              <Text style={styles.emoji}>{item.emoji}</Text>
            ) : (
              <View style={[styles.dot, { backgroundColor: accent }]} />
            )}
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {labelKey ? (
              <View style={[styles.badge, { backgroundColor: `${accent}1f` }]}>
                <Text style={[styles.badgeText, { color: accent }]}>{t(labelKey)}</Text>
              </View>
            ) : null}
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingRight: 14,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
    },
    emoji: {
      width: 18,
      textAlign: 'center',
      fontSize: 15,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      marginHorizontal: 4,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg1,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    badgeText: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 10,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
  })
}
