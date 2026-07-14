import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { createTokensV2, easings } from '@/lib/theme'
import { SelectCheck } from '@/components/ui/select-check'
import { styles } from './habit-row-styles'

interface HabitRowLeadingProps {
  habitTitle: string
  emoji: NormalizedHabit['emoji']
  emojiSize: number
  wellSize: number
  wellRadius: number
  isSelectMode: boolean
  isSelected: boolean
  hasChildren: boolean
  isExpanded: boolean
  onToggleSelection?: () => void
  onToggleExpand?: () => void
  tokens: ReturnType<typeof createTokensV2>
}

/** Leading cluster of a habit row: select checkbox, expand chevron, and emoji well. */
// react-doctor-disable-next-line no-many-boolean-props -- private row-internal cluster; the flags are independent render inputs from the parent row, not a combinatorial public API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitRowLeading({
  habitTitle,
  emoji,
  emojiSize,
  wellSize,
  wellRadius,
  isSelectMode,
  isSelected,
  hasChildren,
  isExpanded,
  onToggleSelection,
  onToggleExpand,
  tokens,
}: Readonly<HabitRowLeadingProps>) {
  const { t } = useTranslation()

  const expandChevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withTiming(isExpanded ? '0deg' : '-90deg', {
          duration: 160,
          easing: Easing.bezier(...easings.smooth),
          reduceMotion: ReduceMotion.System,
        }),
      },
    ],
  }))

  return (
    <>
      {isSelectMode ? (
        <SelectCheck
          selected={isSelected}
          onPress={onToggleSelection}
          accessibilityLabel={habitTitle}
        />
      ) : null}

      {hasChildren && !isSelectMode ? (
        <Pressable
          onPress={onToggleExpand}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? t('common.collapse') : t('common.expand')}
        >
          <Animated.View style={expandChevronStyle}>
            <ChevronDown size={14} color={tokens.fg3} strokeWidth={1.8} />
          </Animated.View>
        </Pressable>
      ) : null}

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
    </>
  )
}
