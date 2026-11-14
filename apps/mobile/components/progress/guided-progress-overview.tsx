import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { BarChartPoint } from '@orbit/shared/contracts/display'
import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { motionDurations, motionEasings, SPACING } from '@orbit/shared/theme'
import {
  getBestRetrospectiveWeekdayKey,
  mapCompletionSeries,
  resolveProgressOrbitLine,
  resolveProgressWindowStatus,
  type ProgressWindowStatus,
} from '@orbit/shared/utils'
import { PROGRESS_SUBMENUS } from '@orbit/shared/utils/progress-navigation'
import type { RetrospectiveMetrics } from '@orbit/shared/utils/retrospective'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { useRootScrollToTop } from '@/components/shell/root-scroll-context'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ActionRow } from '@/components/ui/action-row'
import { BarChart } from '@/components/ui/bar-chart'
import { ErrorState } from '@/components/ui/error-state'
import { useFlowLookState } from '@/components/ui/flow-look'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsGroup } from '@/components/ui/settings-group'
import { StatTile } from '@/components/ui/stat-tile'
import { useChangedProgressFigures } from '@/hooks/use-changed-progress-figures'
import { useProgressRetrospective } from '@/hooks/use-retrospective'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { LockedCard } from './locked-card'
import { progressStyles } from './progress-styles'
import { TopHabitRow, WindowFigureGrid, WindowFigureLoading, WindowFrame } from './progress-window'

/** A line that changes cross-fades in. The first line and every line under reduced motion appear still. */
function useLineFade(line: string | null, reducedMotion: boolean) {
  const [opacity] = useState(() => new Animated.Value(1))
  const shownLine = useRef(line)
  useEffect(() => {
    if (shownLine.current === line) return undefined
    shownLine.current = line
    if (reducedMotion) return undefined
    opacity.setValue(0)
    const fade = Animated.timing(opacity, { toValue: 1, duration: motionDurations.micro, easing: Easing.bezier(...motionEasings.standard), useNativeDriver: true })
    fade.start()
    return () => fade.stop()
  }, [line, opacity, reducedMotion])
  return opacity
}

/** Orbit at 96 (128 at 1024 and above), centred, with the one Orbit line of the root under it. */
function ProgressOrbitGroup({ line, mascotRef, lookAt, action, tokens }: Readonly<{
  line: string | null
  mascotRef: RefObject<View | null>
  lookAt: OrbitLookTarget | null
  action?: ReactNode
  tokens: AppTokensV2
}>) {
  const size = useStateMascotSize()
  const reducedMotion = usePrefersReducedMotion()
  const opacity = useLineFade(line, reducedMotion)
  return (
    <View testID="progress-orbit" style={styles.orbitGroup}>
      <View ref={mascotRef} collapsable={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <OrbitMascot size={size} state="parado" lookAt={lookAt} />
      </View>
      {line ? <Animated.Text testID={reducedMotion ? 'progress-orbit-line-still' : 'progress-orbit-line'} style={[styles.line, { color: tokens.fg2 }, reducedMotion ? null : { opacity }]}>{line}</Animated.Text> : null}
      {action}
    </View>
  )
}

function GuidedWindowFigures({ metrics }: Readonly<{ metrics: RetrospectiveMetrics }>) {
  const { t } = useTranslation()
  const changed = useChangedProgressFigures(metrics)
  const bestWeekday = getBestRetrospectiveWeekdayKey(metrics.weeklyConsistency)
  return (
    <WindowFigureGrid>
      <StatTile value={`${Math.round(metrics.completionRate)}%`} label={t('progressScreen.window.completionRate')} roll={changed.has('completionRate')} />
      <StatTile value={metrics.activeDays} label={t('progressScreen.window.activeDays')} roll={changed.has('activeDays')} />
      {bestWeekday
        ? <StatTile value={t(`dates.daysAbbreviated.${bestWeekday}`)} label={t('progressScreen.window.bestWeekday')} roll={changed.has('bestWeekday')} />
        : <StatTile state="empty" emptyLabel={t('progressScreen.window.bestWeekdayEmpty')} label={t('progressScreen.window.bestWeekday')} />}
    </WindowFigureGrid>
  )
}

/** The 30-day window under the question heading. The empty window has no heading: Orbit states it. */
function GuidedWindowSection({ status, retrospective, tokens, onSelectPoint, onChartTouch }: Readonly<{
  status: ProgressWindowStatus
  retrospective: ReturnType<typeof useProgressRetrospective>
  tokens: AppTokensV2
  onSelectPoint: (point: BarChartPoint, bar: View | null) => void
  onChartTouch: () => void
}>) {
  const { t, i18n } = useTranslation()
  const title = t('progressScreen.sections.windowQuestion')
  if (status === 'empty') return null
  if (status === 'locked') return <WindowFrame title={title} tokens={tokens}><View style={progressStyles.windowLock}><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} tokens={tokens} /></View></WindowFrame>
  if (status === 'loading') return <WindowFrame title={title} tokens={tokens} statusText={t('progressScreen.loading')}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  if (status === 'error') return <WindowFrame title={title} tokens={tokens}><ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={() => void retrospective.refetch()}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>} /></WindowFrame>
  const metrics = retrospective.data!.metrics
  const points = metrics.completionSeries ? mapCompletionSeries(metrics.completionSeries, i18n.language) : []
  return (
    <WindowFrame title={title} tokens={tokens}>
      {points.some((point) => point.scheduled > 0) ? <View testID="progress-chart" onTouchStart={onChartTouch}><BarChart points={points} label={t('progressScreen.window.chartLabel')} onSelectPoint={onSelectPoint} /></View> : null}
      <GuidedWindowFigures metrics={metrics} />
      <TopHabitRow habit={metrics.topHabits[0]} tokens={tokens} />
      <ActionRow><ShareCardEntryButton variant="button" /></ActionRow>
    </WindowFrame>
  )
}

/** A press on a bar changes the line to that day and Orbit looks at the bar. The same bar again, or a touch outside the chart, returns the default line. */
function useBarSelection() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const { lookAt, mascotRef, lookAtControl, lookAway } = useFlowLookState()
  const touchInChart = useRef(false)
  const select = (point: BarChartPoint, bar: View | null) => {
    if (point.startDate === selectedDate) {
      setSelectedDate(null)
      lookAway()
      return
    }
    setSelectedDate(point.startDate)
    lookAtControl({ current: bar })
  }
  const onChartTouch = useCallback(() => { touchInChart.current = true }, [])
  const onRootTouch = useCallback(() => {
    if (!touchInChart.current) {
      setSelectedDate(null)
      lookAway()
    }
    touchInChart.current = false
  }, [lookAway])
  return { selectedDate, select, lookAt, mascotRef, onChartTouch, onRootTouch }
}

/** The Progresso root under `orbit_guided_flows`: Orbit answers "am I moving", then the person asks the next thing. */
export function GuidedProgressOverview() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const theme = useAppTheme()
  const tokens = createTokensV2(theme.currentScheme, theme.currentTheme)
  const clearance = useShellScrollerClearance()
  const scrollRef = useRef<ScrollView>(null)
  useRootScrollToTop('progresso', useCallback(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }) }, []))
  const retrospective = useProgressRetrospective()
  const status = resolveProgressWindowStatus(retrospective)
  const selection = useBarSelection()
  const line = resolveProgressOrbitLine(status, retrospective.data?.metrics, selection.selectedDate, i18n.language)
  const emptyAction = status === 'empty'
    // eslint-disable-next-line local/max-button-words -- Canvas-owned control copy.
    ? <PillButton variant={width >= 768 ? 'secondary' : 'primary'} size="sm" accessibilityRole="link" onClick={() => router.push('/')}>{t('progressScreen.window.emptyAction')}</PillButton>
    : undefined
  return (
    <ScrollView ref={scrollRef} testID="progress-overview" onTouchStart={selection.onRootTouch} style={[progressStyles.root, { backgroundColor: tokens.bg }]} contentContainerStyle={[progressStyles.content, { paddingBottom: clearance }]}>
      <RootNotificationHeader />
      <View testID="progress-sections" style={progressStyles.sections}>
        <Text accessibilityRole="header" style={progressStyles.screenReaderTitle}>{t('progressScreen.title')}</Text>
        <ProgressOrbitGroup line={line ? t(line.key, line.values) : null} mascotRef={selection.mascotRef} lookAt={selection.lookAt} action={emptyAction} tokens={tokens} />
        <GuidedWindowSection status={status} retrospective={retrospective} tokens={tokens} onSelectPoint={selection.select} onChartTouch={selection.onChartTouch} />
        <View testID="progress-rows" style={progressStyles.windowSection}>
          <Text accessibilityRole="header" style={[progressStyles.sectionTitle, { color: tokens.fg1 }]}>{t('progressScreen.sectionsQuestion')}</Text>
          <SettingsGroup>
            {PROGRESS_SUBMENUS.map((entry) => <ListRow key={entry.id} placement="column" textMode="label" icon={entry.icon} title={t(entry.labelKey)} description={entry.descriptionKey ? t(entry.descriptionKey) : undefined} href={entry.route} onClick={() => router.push(entry.route)} />)}
          </SettingsGroup>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  orbitGroup: { alignItems: 'center', gap: SPACING.s12 },
  line: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 592 },
})
