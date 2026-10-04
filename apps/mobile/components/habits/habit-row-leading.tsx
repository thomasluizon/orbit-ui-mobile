import { Text, View } from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { habitInitial } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { styles } from './habit-row-styles'

interface HabitRowLeadingProps {
  habitTitle: string
  emoji: NormalizedHabit['emoji']
  emojiSize: number
  wellSize: number
  wellRadius: number
  tokens: ReturnType<typeof createTokensV2>
}

export function HabitRowLeading({
  habitTitle,
  emoji,
  emojiSize,
  wellSize,
  wellRadius,
  tokens,
}: Readonly<HabitRowLeadingProps>) {
  return (
    <View style={{ width: 48, flexShrink: 0 }}>
      <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.emojiWell,
            {
              width: wellSize,
              height: wellSize,
              borderRadius: wellRadius,
              backgroundColor: tokens.bgWell,
            },
          ]}
        >
          {emoji ? (
            <Text style={{ fontSize: emojiSize, lineHeight: emojiSize + 2 }}>{emoji}</Text>
          ) : (
            <Text
              style={{
                fontSize: emojiSize === 16 ? 12 : 17,
                lineHeight: emojiSize + 2,
                color: tokens.fg3,
                fontFamily: 'Geist_500Medium',
              }}
            >
              {habitInitial(habitTitle)}
            </Text>
          )}
      </View>
    </View>
  )
}
