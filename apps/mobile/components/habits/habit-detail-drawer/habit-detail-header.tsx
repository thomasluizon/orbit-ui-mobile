import { Text, View } from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { createTokensV2 } from '@/lib/theme'
import type { createDrawerStyles } from './styles'

interface HabitDetailHeaderProps {
  habit: NormalizedHabit
  tokens: ReturnType<typeof createTokensV2>
  styles: ReturnType<typeof createDrawerStyles>
  summaryStrip: string
}

export function HabitDetailHeader({
  habit,
  tokens,
  styles,
  summaryStrip,
}: Readonly<HabitDetailHeaderProps>) {
  if (!(habit.emoji || summaryStrip || habit.tags.length > 0)) return null
  return (
    <View style={styles.titleBlock}>
      {habit.emoji ? (
        <View
          style={[
            styles.emojiWell,
            habit.isBadHabit
              ? { backgroundColor: `${tokens.statusBad}1F` }
              : null,
          ]}
        >
          <Text style={styles.emojiWellText}>{habit.emoji}</Text>
        </View>
      ) : null}
      {summaryStrip ? (
        <Text
          style={[
            styles.titleMeta,
            { color: habit.isBadHabit ? tokens.statusBad : tokens.fg3 },
          ]}
          numberOfLines={2}
        >
          {summaryStrip}
        </Text>
      ) : null}
      {habit.tags.length > 0 ? (
        <View style={styles.drawerTagRow}>
          {habit.tags.map((tag) => (
            <View key={tag.id} style={styles.drawerTagChip}>
              <View style={[styles.drawerTagDot, { backgroundColor: tag.color }]} />
              <Text style={[styles.drawerTagName, { color: tokens.fg3 }]}>
                {tag.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
