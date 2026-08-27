import { Fragment, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { createTokensV2 } from '@/lib/theme'
import { styles } from './habit-row-styles'

export type HabitRowMetaPart =
  | string
  | { kind: 'overdue' }
  | { kind: 'bad' }
  | { kind: 'future'; label: string }

interface HabitRowContentProps {
  habit: NormalizedHabit
  titleSize: number
  titleColor: string
  isDoneForRange: boolean
  metaParts: HabitRowMetaPart[]
  tokens: ReturnType<typeof createTokensV2>
}

export function HabitRowContent({
  habit,
  titleSize,
  titleColor,
  isDoneForRange,
  metaParts,
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

      {metaParts.length > 0 ? (
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: tokens.fg3 }]}
        >
          {metaParts.map((part, i) => {
            let partContent: ReactNode
            if (typeof part === 'string') partContent = part
            else if (part.kind === 'future') partContent = part.label
            else if (part.kind === 'overdue')
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
            else
              partContent = (
                <Text
                  style={{
                    fontFamily: 'Rubik_500Medium',
                    color: tokens.statusBadText,
                  }}
                >
                  {t('habits.statusDot.bad')}
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
        </Text>
      ) : null}
    </View>
  )
}
