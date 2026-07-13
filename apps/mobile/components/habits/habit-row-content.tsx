import { Fragment, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { stripInlineMarkdown } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { createTokensV2 } from '@/lib/theme'
import { MAX_VISIBLE_TAGS, styles } from './habit-row-styles'

export type HabitRowMetaPart =
  | string
  | { kind: 'overdue' }
  | { kind: 'future'; label: string }

interface HabitRowContentProps {
  habit: NormalizedHabit
  titleSize: number
  titleColor: string
  isDoneForRange: boolean
  metaParts: HabitRowMetaPart[]
  showStreak: boolean
  streak: number
  tokens: ReturnType<typeof createTokensV2>
}

export function HabitRowContent({
  habit,
  titleSize,
  titleColor,
  isDoneForRange,
  metaParts,
  showStreak,
  streak,
  tokens,
}: Readonly<HabitRowContentProps>) {
  const { t } = useTranslation()
  const metaKeys = metaParts.map((_, index) => `meta-part-${index}`)
  return (
    <View style={styles.titleBlock}>
      <Text
        numberOfLines={2}
        style={[
          styles.title,
          {
            fontSize: titleSize,
            color: titleColor,
            textDecorationLine: isDoneForRange ? 'line-through' : 'none',
            textDecorationColor: tokens.fg4,
          },
        ]}
      >
        {habit.title}
      </Text>

      {habit.description?.trim() ? (
        <Text
          numberOfLines={1}
          style={[styles.description, { color: tokens.fg3 }]}
        >
          {stripInlineMarkdown(habit.description)}
        </Text>
      ) : null}

      {metaParts.length > 0 || showStreak ? (
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: tokens.fg3 }]}
        >
          {metaParts.map((part, i) => {
            let partContent: ReactNode
            if (typeof part === 'string') partContent = part
            else if (part.kind === 'future') partContent = part.label
            else
              partContent = (
                <Text
                  style={{
                    fontFamily: 'Rubik_500Medium',
                    color: tokens.statusOverdueText,
                  }}
                >
                  {t('habits.overdue')}
                </Text>
              )
            return (
              <Fragment key={metaKeys[i]}>
                {i > 0 ? (
                  <Text style={{ color: tokens.fg3 }}> · </Text>
                ) : null}
                {partContent}
              </Fragment>
            )
          })}
          {showStreak ? (
            <Text style={{ color: tokens.statusOverdueText }}>
              {metaParts.length > 0 ? '  ' : ''}🔥 {streak}
            </Text>
          ) : null}
        </Text>
      ) : null}

      {habit.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {habit.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
            <View key={tag.id} style={styles.tagChip}>
              <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
              <Text numberOfLines={1} style={[styles.tagName, { color: tokens.fg3 }]}>
                {tag.name}
              </Text>
            </View>
          ))}
          {habit.tags.length > MAX_VISIBLE_TAGS ? (
            <Text style={[styles.tagOverflow, { color: tokens.fg3 }]}>
              +{habit.tags.length - MAX_VISIBLE_TAGS}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
