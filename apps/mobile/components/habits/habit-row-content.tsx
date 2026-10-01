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
  metaColor: string
  metaParts: HabitRowMetaPart[]
  tokens: ReturnType<typeof createTokensV2>
}

export function HabitRowContent({
  habit,
  titleSize,
  titleColor,
  metaColor,
  metaParts,
  tokens,
}: Readonly<HabitRowContentProps>) {
  const { t } = useTranslation()
  const visibleMeta = metaParts.filter((part) => typeof part === 'string' || part.kind !== 'future')
  const metaKeys = visibleMeta.map((_, index) => `meta-part-${index}`)
  return (
    <View style={styles.titleBlock}>
      <Text
        numberOfLines={2}
        style={[
          styles.title,
          {
            fontSize: titleSize,
            color: titleColor,
          },
        ]}
      >
        {habit.title}
      </Text>

      {visibleMeta.length > 0 ? (
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: metaColor }]}
        >
          {visibleMeta.map((part, i) => {
            let partContent: ReactNode
            if (typeof part === 'string') partContent = part
            else if (part.kind === 'future') partContent = part.label
            else if (part.kind === 'overdue')
              partContent = (
                <Text
                  style={{
                    fontFamily: 'Geist_500Medium',
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
                    fontFamily: 'Geist_500Medium',
                    color: tokens.statusBadText,
                  }}
                >
                  {t('habits.statusDot.bad')}
                </Text>
              )
            return (
              <Fragment key={metaKeys[i]}>
                {i > 0 ? (
                  <Text style={{ color: metaColor }}> · </Text>
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
