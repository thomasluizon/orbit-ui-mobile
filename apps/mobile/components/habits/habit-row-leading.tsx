import { Text, View } from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
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

/** Emoji well. Disclosure and selection are structural sibling columns owned by the list. */
export function HabitRowLeading({
  habitTitle,
  emoji,
  emojiSize,
  wellSize,
  wellRadius,
  tokens,
}: Readonly<HabitRowLeadingProps>) {
  return (
    <View
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
              fontSize: emojiSize - 4,
              lineHeight: emojiSize + 2,
              color: tokens.fg3,
              fontFamily: 'Rubik_500Medium',
            }}
          >
            {[...habitTitle.trim().toUpperCase()][0]}
          </Text>
        )}
    </View>
  )
}
