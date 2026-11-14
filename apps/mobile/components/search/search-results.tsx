import { IconButton } from '@/components/ui/icon-button'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PersonalText } from '@/components/ui/personal-text'
import { SPACING, hoverForeground, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useState } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { Trans, useTranslation } from 'react-i18next'
import { buildSearchHabitStatus, buildSearchMatchLines, formatAPIDate, habitInitial, nowDate, type SearchHabitStatus } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ChevronRight, X, Plus } from '@/components/ui/icons'

import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitCheck } from '@/components/habits/habit-check'
import { Skeleton } from '@/components/ui/skeleton'

const SEARCH_SKELETON_ROWS = ['first', 'second', 'third'] as const

/** A search that waits holds the place of its results with skeleton rows shaped like `SearchResult`. */
export function Searching() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View testID="search-skeleton" accessible accessibilityRole="progressbar" accessibilityLabel={t('habits.search.searching')} accessibilityState={{ busy: true }} accessibilityLiveRegion="polite" style={styles.skeletonList}>
    {SEARCH_SKELETON_ROWS.map((row) => <View key={row} testID="search-skeleton-row" style={[styles.row, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost, borderWidth: 1 }]}>
      <View style={styles.well}><Skeleton variant="fill" grouped /></View>
      <View style={[styles.content, styles.skeletonCopy]}>
        <View style={styles.skeletonTitle}><Skeleton variant="fill" grouped /></View>
        <View style={styles.skeletonMeta}><Skeleton variant="fill" grouped /></View>
      </View>
      <View style={styles.chevronSlot} />
    </View>)}
  </View>
}

export function SearchEmpty({ query, onCreate, onClearSearch }: Readonly<{ query: string; onCreate?: () => void; onClearSearch?: () => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={styles.empty}>
    <Text style={[styles.name, { color: tokens.fg1 }]}><Trans i18nKey="habits.search.emptyTitle" values={{ query }} components={{ queryText: <Text /> }} /></Text>
    <Text style={[styles.body, { color: tokens.fg3 }]}>{t('habits.search.emptyBody')}</Text>
    <IconButton edge="start" label={t(onClearSearch ? 'common.clear' : 'habits.search.create')} onClick={onClearSearch ?? onCreate}>{onClearSearch ? <X size={20} accessible={false} /> : <Plus size={20} accessible={false} />}</IconButton>
  </View>
}

export function SearchResult({ habit, query, today = formatAPIDate(nowDate()), onOpen, actionLabel, disabled = false }: Readonly<{ habit: NormalizedHabit; today?: string; query: string; onOpen: () => void; actionLabel?: string; disabled?: boolean }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [clamped, setClamped] = useState(false)
  const [pressed, setPressed] = useState(false)
  const matches = buildSearchMatchLines(query, habit, t)
  const status = buildSearchHabitStatus(habit, t, i18n.language, today)
  const accessibleName = [actionLabel ?? t('habits.search.open', { name: habit.title }), ...(status ? [status.label] : []), ...matches.map((match) => match.text)].join(' ')
  return <View style={{ flexDirection: 'row', minWidth: 0, alignItems: 'center' }}><Pressable role="button" accessibilityRole="button" disabled={disabled} accessibilityLabel={accessibleName} accessibilityState={{ disabled }} onPress={onOpen} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={({ pressed }) => [styles.row, { flex: 1, minWidth: 0 }, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.hairlineGhost, borderWidth: 1 }]}>
    <View importantForAccessibility="no-hide-descendants" style={[styles.well, { backgroundColor: tokens.bgWell }]}>{habit.emoji ? <Text style={styles.emoji}>{habit.emoji}</Text> : <Text style={[styles.initial, { color: tokens.fg2 }]}>{habitInitial(habit.title)}</Text>}</View>
    <View style={styles.content}><PersonalText onClampedChange={setClamped} style={[styles.name, { color: tokens.fg1, lineHeight: 23.8 }]}>{habit.title}</PersonalText>
      <SearchHabitStatusLine status={status} color={tokens.fg2} />
      {matches.map((match) => <View key={match.id} style={{ minWidth: 0 }}><Text style={[styles.match, { color: hoverForeground(currentTheme, tokens.fg3, pressed) }]}>{match.label}</Text>{match.fragment !== null ? <PersonalText style={[styles.match, { color: tokens.fg2 }]}>{match.fragment}</PersonalText> : null}</View>)}
    </View><ChevronRight size={20} color={tokens.fg3} />
  </Pressable>{actionLabel ? <PersonalTextDetails iconOnly clamped={clamped}>{habit.title}</PersonalTextDetails> : null}</View>
}

function SearchHabitStatusLine({ status, color }: Readonly<{ status: SearchHabitStatus | null; color: string }>) {
  if (!status) return null
  return <View style={styles.status}>
    {status.kind === 'done' ? <View importantForAccessibility="no-hide-descendants"><HabitCheck status="done" /></View> : null}
    <Text style={[styles.match, styles.statusLabel, { color }]}>{status.label}</Text>
  </View>
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH_TARGET_MIN, padding: SPACING.s12, gap: 12, borderRadius: radius.md, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  well: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 }, content: { flex: 1, minWidth: 0, gap: 0 },
  initial: { fontFamily: 'Geist_500Medium', fontSize: 16 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, statusLabel: { flexShrink: 0 },
  name: { fontFamily: 'Geist_400Regular', fontSize: 17 }, match: { fontFamily: 'GeistMono_400Regular', fontSize: 12 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14 }, empty: { alignItems: 'flex-start', padding: SPACING.s12, gap: 12 },
  skeletonList: { gap: 8 }, skeletonCopy: { gap: 8 }, skeletonTitle: { width: '66%', height: 16 }, skeletonMeta: { width: '33%', height: 12 }, chevronSlot: { width: 20, height: 20 },
})
