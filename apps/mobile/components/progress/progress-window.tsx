import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SPACING } from '@orbit/shared/theme'
import {
  extractBackendErrorCode,
  getBestRetrospectiveWeekdayKey,
  isPayGateError,
  mapCompletionSeries,
} from '@orbit/shared/utils'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ActionRow } from '@/components/ui/action-row'
import { BarChart } from '@/components/ui/bar-chart'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown, ChevronRight, RefreshCw } from '@/components/ui/icons'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { PersonalText } from '@/components/ui/personal-text'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { useProgressRetrospective } from '@/hooks/use-retrospective'
import type { AppTokensV2 } from '@/lib/theme'
import { LockedCard } from './locked-card'
import { progressStyles } from './progress-styles'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

export function WindowFigureGrid({ children }: Readonly<{ children: ReactNode[] }>) {
  const { width, fontScale } = useWindowDimensions()
  const columns = width / fontScale >= 768 ? 3 : width / fontScale >= 360 ? 2 : 1

  return (
    <View testID={`progress-window-grid-${columns}`} style={styles.windowGrid}>
      {Array.from({ length: Math.ceil(children.length / columns) }, (_, rowIndex) => (
        <View key={rowIndex} testID="progress-window-row" style={styles.windowRow}>
          {children.slice(rowIndex * columns, (rowIndex + 1) * columns).map((child, columnIndex) => (
            <View key={columnIndex} style={styles.windowTile}>{child}</View>
          ))}
        </View>
      ))}
    </View>
  )
}

/** One busy region covers the figures and the habit row. */
export function WindowFigureLoading({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation()
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={progressStyles.windowSection}>
      <Skeleton variant="bar-chart" grouped />
      <WindowFigureGrid>
        {(['completionRate', 'activeDays', 'bestWeekday'] as const).map((key) => <View key={key} importantForAccessibility="no-hide-descendants"><StatTile state="loading" loadingLabel={label} label={t(`progressScreen.window.${key}`)} /></View>)}
      </WindowFigureGrid>
      <Skeleton variant="habit-row" grouped />
    </View>
  )
}

export function WindowFrame({ children, title, tokens, statusText = '' }: Readonly<{
  children: ReactNode
  title: string
  tokens: AppTokensV2
  statusText?: string
}>) {
  return (
    <View testID="progress-window-section" style={progressStyles.windowSection}>
      <Text accessibilityRole="header" style={[progressStyles.sectionTitle, { color: tokens.fg1 }]}>{title}</Text>
      <Text accessibilityLiveRegion="polite" style={progressStyles.screenReaderTitle} testID="progress-window-status">{statusText}</Text>
      {children}
    </View>
  )
}

export function TopHabitRow({ habit, tokens }: Readonly<{ habit?: { name: string; emoji: string | null; habitId?: string | null }; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const [hovered, setHovered] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const habitId = habit?.habitId
  const ChevronIcon = habitId ? ChevronRight : ChevronDown
  const content = <>
    <View style={styles.topHabitLabelRow}>
      <Text style={[progressStyles.body, { color: tokens.fg2 }]}>{t('progressScreen.window.topHabit')}</Text>
      {habit ? <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.topHabitChevron}><ChevronIcon size={24} strokeWidth={1.5} color={tokens.fg3} /></View> : null}
    </View>
    {habit ? <View style={{ flexDirection: 'row', gap: 4, minWidth: 0 }}>{habit.emoji ? <Text accessible={false} style={[styles.topHabitName, { color: tokens.fg1 }]}>{habit.emoji}</Text> : null}<View style={{ flex: 1, minWidth: 0 }}><PersonalText expanded={expanded} selectable={!habitId} accessibilityLabel={habit.name} style={[styles.topHabitName, { color: tokens.fg1 }]}>{habit.name}</PersonalText></View></View>
      : <Text style={[progressStyles.body, { color: tokens.fg3 }]}>{t('progressScreen.window.topHabitEmpty')}</Text>}
  </>
  return habitId
    ? <InsetFocusPressable testID="progress-top-habit" accessibilityRole="link" accessibilityLabel={`${t('progressScreen.window.topHabit')}, ${habit.name}`}
        onPress={() => router.push({ pathname: '/habits/[id]', params: { id: habitId } })}
        onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
        style={({ pressed }) => [styles.topHabit, { backgroundColor: pressed || hovered ? tokens.bgHover : 'transparent' }]}>{content}</InsetFocusPressable>
    : habit ? <InsetFocusPressable testID="progress-top-habit" accessibilityRole="button" accessibilityLabel={`${t('progressScreen.window.topHabit')}, ${habit.name}`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.topHabit, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}>{content}</InsetFocusPressable> : <View testID="progress-top-habit" style={styles.topHabit}>{content}</View>
}

export function WindowSection({ tokens }: Readonly<{ tokens: AppTokensV2 }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const retrospective = useProgressRetrospective()
  if (isPayGateError(retrospective.error)) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}><View style={progressStyles.windowLock}><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} tokens={tokens} /></View></WindowFrame>
  if (retrospective.isLoading) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens} statusText={t('progressScreen.loading')}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const hasNoHabits = retrospective.isError && extractBackendErrorCode(retrospective.error) === NO_HABITS_FOR_PERIOD
  if (hasNoHabits) {
    const emptyAction = (
      // eslint-disable-next-line local/max-button-words -- Canvas-owned control copy.
      <PillButton variant={width >= 768 ? 'secondary' : 'primary'} size="sm" accessibilityRole="link" onClick={() => router.push('/')}>{t('progressScreen.window.emptyAction')}</PillButton>
    )
    return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens} statusText={t('progressScreen.window.empty')}><EmptyState title={t('progressScreen.window.empty')} action={emptyAction} /></WindowFrame>
  }
  if (retrospective.isError) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}><ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={() => void retrospective.refetch()}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} /></WindowFrame>
  if (!retrospective.data) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const metrics = retrospective.data.metrics
  const bestWeekday = getBestRetrospectiveWeekdayKey(metrics.weeklyConsistency)
  const topHabit = metrics.topHabits[0]
  const points = metrics.completionSeries ? mapCompletionSeries(metrics.completionSeries, i18n.language) : []
  return (
    <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}>
      {points.some((point) => point.scheduled > 0) ? <BarChart points={points} label={t('progressScreen.window.chartLabel')} /> : null}
      <WindowFigureGrid>
        <StatTile value={`${Math.round(metrics.completionRate)}%`} label={t('progressScreen.window.completionRate')} />
        <StatTile value={metrics.activeDays} label={t('progressScreen.window.activeDays')} />
        {bestWeekday
          ? <StatTile value={t(`dates.daysAbbreviated.${bestWeekday}`)} label={t('progressScreen.window.bestWeekday')} />
          : <StatTile state="empty" emptyLabel={t('progressScreen.window.bestWeekdayEmpty')} label={t('progressScreen.window.bestWeekday')} />}
      </WindowFigureGrid>
      <TopHabitRow habit={topHabit} tokens={tokens} />
      <ActionRow><ShareCardEntryButton variant="button" /></ActionRow>
    </WindowFrame>
  )
}

const styles = StyleSheet.create({
  topHabit: { minHeight: 68, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s16, borderRadius: 12, overflow: 'hidden', gap: 4, minWidth: 0 },
  topHabitChevron: { width: 24, height: 24, flexShrink: 0 },
  topHabitLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  topHabitName: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24 },
  windowGrid: { gap: 16 },
  windowRow: { flexDirection: 'row', gap: 16 },
  windowTile: { flex: 1, minWidth: 0 },
})
