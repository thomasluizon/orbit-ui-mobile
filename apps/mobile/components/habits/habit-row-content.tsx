import { HABIT_ROW_META_TOKEN_GAP, stripInlineMarkdown } from '@orbit/shared/utils'
import { PersonalText } from '@/components/ui/personal-text'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ListChecks } from '@/components/ui/icons'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { createTokensV2 } from '@/lib/theme'
import { styles } from './habit-row-styles'

export type HabitRowMetaPart =
  | string
  | { kind: 'overdue' }
  | { kind: 'bad' }
  | { kind: 'future'; label: string }
  | { kind: 'date-status'; label: string }
  | { kind: 'type'; label: string }
  | { kind: 'next'; label: string }
  | { kind: 'checklist'; label: string; done: number; total: number }

interface HabitRowContentProps {
  habit: NormalizedHabit
  titleSize: number
  titleColor: string
  expanded?: boolean
  largeText?: boolean
  metaColor: string
  /** The tokens the inline strip draws, from `visibleHabitRowMetaTokens`. */
  visibleMetaParts: HabitRowMetaPart[]
  tokens: ReturnType<typeof createTokensV2>
  metaOnSupportingLine?: boolean
  onContentWidth?: (width: number) => void
  onTokenWidth?: (key: string, width: number) => void
}

export function HabitRowContent({
  habit,
  titleSize,
  titleColor,
  expanded = false,
  largeText = false,
  metaColor,
  visibleMetaParts,
  tokens,
  metaOnSupportingLine = false,
  onContentWidth,
  onTokenWidth,
}: Readonly<HabitRowContentProps>) {
  const description = stripInlineMarkdown(habit.description ?? '')
  return (
    <View testID="habit-row-title-block" onLayout={(event) => onContentWidth?.(event.nativeEvent.layout.width)} style={styles.titleBlock}>
      <PersonalText expanded={expanded}
        style={[
          styles.title,
          {
            fontSize: titleSize,
            color: titleColor,
          },
        ]}
      >
        {habit.title}
      </PersonalText>

      {description ? <Text testID="habit-row-description" accessible={false}
        numberOfLines={largeText ? 2 : 1} ellipsizeMode="tail"
        style={[styles.description, { color: metaColor }]}>{description}</Text> : null}

      {metaOnSupportingLine ? null : <HabitRowMetaStrip visibleMetaParts={visibleMetaParts} metaColor={metaColor} tokens={tokens} largeText={largeText} onTokenWidth={onTokenWidth} />}
    </View>
  )
}

function habitRowMetaPartName(part: HabitRowMetaPart): string {
  if (typeof part === 'string') return part
  return 'label' in part ? part.label : part.kind
}

export function habitRowMetaPartKey(part: HabitRowMetaPart, index: number): string {
  return `${index}:${habitRowMetaPartName(part)}`
}

/** Draws the visible tokens; each token reports its width under `habitRowMetaPartKey`, the key the row's fit hook builds from the same list. */
export function HabitRowMetaStrip({ visibleMetaParts, metaColor, tokens, largeText = false, onTokenWidth }: Readonly<{
  visibleMetaParts: HabitRowMetaPart[]
  metaColor: string
  tokens: ReturnType<typeof createTokensV2>
  largeText?: boolean
  onTokenWidth?: (key: string, width: number) => void
}>) {
  const metaKeys = visibleMetaParts.map((part, index) => habitRowMetaPartKey(part, index))
  if (visibleMetaParts.length === 0) return null
  return (
    <View testID="habit-row-meta" accessible={false} importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: HABIT_ROW_META_TOKEN_GAP, minWidth: 0 }}>
      {visibleMetaParts.map((part, i) => <View key={metaKeys[i]} testID="habit-row-meta-token" onLayout={(event) => onTokenWidth?.(metaKeys[i]!, event.nativeEvent.layout.width)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }, typeof part !== 'string' && part.kind === 'date-status' ? { minWidth: 0, maxWidth: '100%', flexShrink: 1 } : undefined]}>
        <HabitRowMetaToken part={part} metaColor={metaColor} tokens={tokens} largeText={largeText} onWrap={() => onTokenWidth?.(metaKeys[i]!, Infinity)} />
        {i < visibleMetaParts.length - 1 ? <Text style={[styles.meta, { color: metaColor }]}>·</Text> : null}
      </View>)}
    </View>
  )
}

function HabitRowMetaToken({ part, metaColor, tokens, largeText, onWrap }: Readonly<{
  part: HabitRowMetaPart
  metaColor: string
  tokens: ReturnType<typeof createTokensV2>
  largeText: boolean
  onWrap: () => void
}>) {
  const { t } = useTranslation()
  if (typeof part !== 'string' && part.kind === 'checklist') return (
    <View testID="habit-row-checklist" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <ListChecks size={largeText ? 24 : 16} color={metaColor} strokeWidth={1.5} accessible={false} />
      <Text style={[styles.meta, { color: metaColor }]}>{`${part.done}/${part.total}`}</Text>
    </View>
  )
  const kind = typeof part === 'string' ? undefined : part.kind
  const stateLabel = kind === 'overdue' ? t('habits.overdue') : t('habits.statusDot.bad')
  const label = typeof part === 'string' || 'label' in part ? habitRowMetaPartName(part) : stateLabel
  const stateColor = kind === 'overdue' ? tokens.statusOverdueText : tokens.statusBadText
  return <Text testID={kind === 'type' ? 'habit-row-type' : undefined}
    onTextLayout={kind === 'next' || kind === 'date-status' ? (event) => { if (event.nativeEvent.lines.length > 1) onWrap() } : undefined}
    style={[styles.meta, { color: metaColor }, kind === 'date-status' ? { minWidth: 0, flexShrink: 1 } : null, kind === 'overdue' || kind === 'bad' ? { color: stateColor, fontFamily: 'Geist_500Medium' } : null]}>{label}</Text>
}
