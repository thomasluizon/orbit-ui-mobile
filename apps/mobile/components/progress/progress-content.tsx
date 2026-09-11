import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist'
import type { Achievement } from '@orbit/shared/types/gamification'
import type { Goal, GoalPositionItem } from '@orbit/shared/types/goal'
import {
  achievementGlyphKey,
  buildGoalMovePositions,
  buildProtectedDayLabels,
  buildStreakWeekDays,
  extractBackendErrorCode,
  filterProgressGoals,
  getAvailableStreakRepairDate,
  getBestRetrospectiveWeekdayKey,
  getProgressGoalLabelKey,
  getGamificationLevelTitleKey,
  getStreakTierLabelKey,
  deriveProgressViewState,
  visibleProgressAchievements,
  type ProgressGoalFilter,
} from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { useGoalDrag } from './use-goal-drag'
import { DayStrip } from '@/components/dates/day-strip'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { FreezeBank } from '@/components/ui/freeze-bank'
import {
  Calendar,
  Flame,
  Lock,
  Satellite,
  Shield,
  Snowflake,
  Star,
  Sun,
  Target,
  Trophy,
  Zap,
  type IconProps,
} from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ProgressRing } from '@/components/ui/progress-ring'
import { ProBadge } from '@/components/ui/pro-badge'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusRing } from '@/components/ui/status-ring'
import { useGamificationProfile, useRepairStreak, useStreakFreeze } from '@/hooks/use-gamification'
import { useGoals, useReorderGoals } from '@/hooks/use-goals'
import { useProfile } from '@/hooks/use-profile'
import { useProgressRetrospective } from '@/hooks/use-retrospective'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useAppTheme } from '@/lib/use-app-theme'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

function Section({ title, children, tokens, compact = false }: Readonly<{ title: string; children: ReactNode; tokens: AppTokensV2; compact?: boolean }>) {
  return <View style={[styles.section, compact ? styles.compactSection : undefined]}><Text accessibilityRole="header" style={[compact ? styles.compactTitle : styles.sectionTitle, { color: compact ? tokens.fg2 : tokens.fg1 }]}>{title}</Text>{children}</View>
}

function WindowFigureGrid({ children }: Readonly<{ children: ReactNode[] }>) {
  const { width } = useWindowDimensions()
  const columns = width >= 768 ? 4 : 2

  return (
    <View testID={`progress-window-grid-${columns}`} style={styles.windowGrid}>
      {Array.from({ length: 4 / columns }, (_, rowIndex) => (
        <View key={rowIndex} testID="progress-window-row" style={styles.windowRow}>
          {children.slice(rowIndex * columns, (rowIndex + 1) * columns).map((child, columnIndex) => (
            <View key={columnIndex} style={styles.windowTile}>{child}</View>
          ))}
        </View>
      ))}
    </View>
  )
}

/** Four tile-shaped placeholders, ONE busy region: the four stand for one wait, not four. */
function WindowFigureLoading({ label }: Readonly<{ label: string }>) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <WindowFigureGrid>
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" grouped />)}
      </WindowFigureGrid>
    </View>
  )
}

function WindowFrame({ children, title, tokens }: Readonly<{
  children: ReactNode
  title: string
  tokens: AppTokensV2
}>) {
  return (
    <View style={styles.windowSection}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: tokens.fg1 }]}>{title}</Text>
      {children}
    </View>
  )
}

function LockedCard({ title, body, action, tokens }: Readonly<{ title: string; body: string; action: string; tokens: AppTokensV2 }>) {
  const router = useRouter()
  return (
    <View testID="progress-locked-card" style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <View style={styles.lockHeader}><Lock size={20} strokeWidth={2} color={tokens.fg2} /><ProBadge alwaysVisible /></View>
      <View style={styles.copy}><Text style={[styles.cardTitle, { color: tokens.fg1 }]}>{title}</Text><Text style={[styles.body, { color: tokens.fg3 }]}>{body}</Text></View>
      <View style={styles.actionStart}><PillButton variant="ghost" size="sm" onClick={() => router.push(buildUpgradeHref('/progress'))}>{action}</PillButton></View>
    </View>
  )
}

function FrozenTodayStatus({ isFrozenToday, tokens }: Readonly<{ isFrozenToday: boolean; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) setMounted(true) })
    return () => { active = false }
  }, [])
  const showMessage = mounted && isFrozenToday
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={showMessage ? t('progressScreen.streak.frozenToday') : ''} style={showMessage ? [styles.frozenBanner, { backgroundColor: tokens.bgWell }] : styles.screenReaderTitle}>
      {showMessage ? <><Snowflake size={20} strokeWidth={2} color={tokens.statusFrozen} /><Text style={[styles.frozenCopy, { color: tokens.fg2 }]}>{t('progressScreen.streak.frozenToday')}</Text></> : null}
    </View>
  )
}

function StreakSection({ accountProfile, canView, gamificationProfile, tokens }: Readonly<{
  accountProfile: ReturnType<typeof useProfile>['profile']; canView: boolean; gamificationProfile: ReturnType<typeof useGamificationProfile>['profile']; tokens: AppTokensV2
}>) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const timeZone = accountProfile?.timeZone ?? null
  const freeze = useStreakFreeze(accountProfile, timeZone, canView)
  const repair = useRepairStreak(timeZone)
  const currentStreak = freeze.streakInfo?.currentStreak ?? gamificationProfile?.currentStreak ?? accountProfile?.currentStreak ?? 0
  const longestStreak = freeze.streakInfo?.longestStreak ?? gamificationProfile?.longestStreak ?? accountProfile?.longestStreak ?? 0
  const days = buildStreakWeekDays(freeze.streakInfo, currentStreak, freeze.isFrozenToday, new Date(), 14, timeZone ?? undefined)
  const labels = useMemo(() => days.map((day) => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(day.date)), [days, i18n.language])
  const tier = t(getStreakTierLabelKey(currentStreak))
  const repairDate = getAvailableStreakRepairDate(
    freeze.streakInfo?.isRepairAvailable,
    freeze.streakInfo?.repairDate,
  )
  const canRepair = freeze.freezesAvailable > 0
  const dayWords = { active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'), missed: t('progressScreen.streak.missed'), today: t('progressScreen.streak.today') }
  if (canView && freeze.streakQuery.isError) {
    return <View style={styles.streakSection}><Text accessibilityRole="header" style={styles.screenReaderTitle}>{t('progressScreen.sections.streak')}</Text><ErrorState message={t('progressScreen.error')} action={<PillButton variant="ghost" onClick={() => void freeze.streakQuery.refetch()}>{t('progressScreen.retry')}</PillButton>} /></View>
  }
  if (canView && !freeze.streakInfo) {
    return <View style={styles.streakSection}><Text accessibilityRole="header" style={styles.screenReaderTitle}>{t('progressScreen.sections.streak')}</Text><Skeleton variant="habit-row" label={t('progressScreen.loading')} /></View>
  }
  return (
    <View style={styles.streakSection}><Text accessibilityRole="header" style={styles.screenReaderTitle}>{t('progressScreen.sections.streak')}</Text>
      <View style={styles.streakFigure}><Text style={[styles.streak, { color: tokens.fg1 }]}>{new Intl.NumberFormat(i18n.language).format(currentStreak)}</Text><Text style={[styles.streakLabel, { color: tokens.fg2 }]}>{t('progressScreen.streak.currentLabel', { count: currentStreak })}</Text></View>
      <FrozenTodayStatus isFrozenToday={freeze.isFrozenToday} tokens={tokens} />
      <DayStrip size={width >= 768 ? 24 : 20} scope="account" days={days.map((day) => day.status)} labels={labels} label={t('progressScreen.streak.stripWindow', { count: days.length })} words={dayWords} />
      {canView && freeze.streakInfo ? <FreezeBank banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} usedThisMonth={freeze.freezesUsedThisMonth} longestValue={longestStreak} longestLabel={t('progressScreen.streak.longest')} daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)} earnRateDays={7} tierValue={tier} tierLabel={t('streakDisplay.detail.tierTileLabel')} protectedDays={buildProtectedDayLabels(freeze.streakInfo.recentFreezeDates, i18n.language, freeze.isFrozenToday, timeZone ?? undefined)} words={{ ...dayWords, legendLabel: t('progressScreen.streak.legend'), bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'), nextFreezeProgress: t('progressScreen.streak.nextOf', { current: Math.max(0, 7 - freeze.daysUntilNextFreeze), total: 7 }), protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday') }} /> : <><View style={styles.tileGrid}><View style={styles.half}><StatTile value={longestStreak} label={t('progressScreen.streak.longest')} /></View><View style={styles.half}><StatTile value={tier} label={t('streakDisplay.detail.tierTileLabel')} /></View></View><LockedCard title={t('progressScreen.streak.lockedTitle')} body={t('progressScreen.streak.lockedBody')} action={t('progressScreen.streak.lockedAction')} tokens={tokens} /></>}
      {repairDate ? <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}><View style={styles.copy}><Text style={[styles.cardTitle, { color: tokens.fg1 }]}>{t('progressScreen.streak.repairTitle')}</Text><Text style={[styles.body, { color: tokens.fg3 }]}>{canRepair ? t('progressScreen.streak.repairBody', { count: freeze.freezesAvailable }) : t('progressScreen.streak.repairEmpty', { count: freeze.daysUntilNextFreeze })}</Text></View>{canRepair ? <View style={styles.actionStart}><PillButton loading={repair.isPending} onClick={() => repair.mutate()}>{t('progressScreen.streak.repairAction')}</PillButton></View> : null}{repair.isError ? <Text accessibilityRole="alert" style={[styles.body, { color: tokens.statusBadText }]}>{t('progressScreen.streak.repairError')}</Text> : null}</View> : null}
    </View>
  )
}

function GoalIndicator({ goal }: Readonly<{ goal: Goal }>) {
  const { t } = useTranslation()
  if (goal.status === 'Abandoned') return null
  const label = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={30} label={label} />
  return <ProgressRing value={goal.progressPercentage} size={44} label={label} />
}

function GoalCard({ goal, index, canReorder, onDrag, onMove, onOpen, tokens }: Readonly<{
  goal: Goal; index: number; canReorder: boolean; onDrag?: () => void; onMove: (goalId: string, target: number) => void; onOpen: () => void; tokens: AppTokensV2
}>) {
  const { t } = useTranslation()
  const { suppressPress, ...gesture } = useGoalDrag(canReorder ? onDrag : undefined)
  const labelKey = getProgressGoalLabelKey(goal)
  const abandoned = goal.status === 'Abandoned'
  return (
    <Pressable accessible accessibilityRole="button" accessibilityLabel={goal.title}
      accessibilityHint={canReorder ? t('progressScreen.goals.reorderHint') : undefined}
      accessibilityActions={canReorder ? [{ name: 'decrement', label: t('progressScreen.goals.moveUp') }, { name: 'increment', label: t('progressScreen.goals.moveDown') }] : undefined}
      onAccessibilityAction={canReorder ? (event) => {
        const action = event.nativeEvent.actionName
        if (action === 'decrement' || action === 'increment') onMove(goal.id, index + (action === 'decrement' ? -1 : 1))
      } : undefined}
      {...gesture} onPress={() => { if (!suppressPress()) onOpen() }}
      style={({ pressed }) => [styles.goalCard, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.hairlineGhost }]}>
      <View style={styles.goalCopy}>
        <Text style={[styles.goalTitle, { color: abandoned ? tokens.fg3 : tokens.fg1 }]}>{goal.title}</Text>
        <View style={styles.goalMeta}>
          {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
          {!abandoned ? <Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</Text> : null}
        </View>
      </View>
      <GoalIndicator goal={goal} />
    </Pressable>
  )
}

function GoalsSection({ goals, tokens, onOpenGoal }: Readonly<{ goals: readonly Goal[]; tokens: AppTokensV2; onOpenGoal: (goalId: string) => void }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const reorder = useReorderGoals()
  const [filter, setFilter] = useState<ProgressGoalFilter>('all')
  const filtered = filterProgressGoals(goals, filter)
  const options = [{ value: 'all', label: t('progressScreen.goals.all') }, { value: 'active', label: t('progressScreen.goals.active') }, { value: 'completed', label: t('progressScreen.goals.completed') }, { value: 'abandoned', label: t('progressScreen.goals.abandoned') }] as const
  const handleDragEnd = ({ data, from, to }: DragEndParams<Goal>) => {
    if (filter !== 'all' || reorder.isPending || from === to) return
    const positions: GoalPositionItem[] = data.map((goal, position) => ({ id: goal.id, position }))
    reorder.mutate(positions)
  }
  const move = (goalId: string, target: number) => {
    const positions = buildGoalMovePositions(goals, goalId, target)
    if (positions) reorder.mutate(positions)
  }
  const renderGoal = ({ item, getIndex, drag }: RenderItemParams<Goal>) => {
    const index = getIndex() ?? goals.findIndex((goal) => goal.id === item.id)
    return <GoalCard goal={item} index={index} canReorder={filter === 'all' && !reorder.isPending} onDrag={drag} onMove={move} onOpen={() => onOpenGoal(item.id)} tokens={tokens} />
  }
  return (
    <View style={styles.goalsSection}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: tokens.fg1 }]}>{t('progressScreen.sections.goals')}</Text>
      {goals.length > 0 ? <SegmentedControl options={options} value={filter} onChange={setFilter} label={t('progressScreen.goals.views')} /> : null}
      {goals.length === 0 ? <EmptyState title={t('progressScreen.goals.empty')} action={<PillButton variant="ghost" onClick={() => router.push('/')}>{t('progressScreen.startHabit')}</PillButton>} /> : null}
      {goals.length > 0 && filtered.length === 0 ? <View style={styles.emptyLine}><Text style={[styles.body, { color: tokens.fg3 }]}>{t('progressScreen.goals.filterEmpty')}</Text><PillButton variant="ghost" size="sm" onClick={() => setFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></View> : null}
      {filtered.length > 0 && filter === 'all' ? <NestableDraggableFlatList data={filtered} keyExtractor={(goal) => goal.id} renderItem={renderGoal} onDragEnd={handleDragEnd} activationDistance={5} ItemSeparatorComponent={GoalSeparator} /> : null}
      {filter !== 'all' ? filtered.map((goal) => <GoalCard key={goal.id} goal={goal} index={0} canReorder={false} onMove={move} onOpen={() => onOpenGoal(goal.id)} tokens={tokens} />) : null}
      {reorder.isError ? <Text accessibilityRole="alert" style={[styles.body, { color: tokens.fg2 }]}>{t('progressScreen.goals.reorderError')}</Text> : null}
    </View>
  )
}

function GoalSeparator() {
  return <View style={styles.goalSeparator} />
}

function WindowSection({ hasProAccess, tokens }: Readonly<{ hasProAccess: boolean; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const retrospective = useProgressRetrospective(hasProAccess)
  if (!hasProAccess) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}><View style={styles.windowLock}><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} tokens={tokens} /></View></WindowFrame>
  if (retrospective.isLoading) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const hasNoHabits = retrospective.isError && extractBackendErrorCode(retrospective.error) === NO_HABITS_FOR_PERIOD
  if (retrospective.isError && !hasNoHabits) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}><ErrorState message={t('progressScreen.error')} action={<PillButton variant="ghost" onClick={() => void retrospective.refetch()}>{t('progressScreen.retry')}</PillButton>} /></WindowFrame>
  if (!retrospective.data && !hasNoHabits) return <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const metrics = retrospective.data?.metrics
  const bestWeekday = getBestRetrospectiveWeekdayKey(metrics?.weeklyConsistency ?? [])
  const topHabit = metrics?.topHabits[0]
  return (
    <WindowFrame title={t('progressScreen.sections.window')} tokens={tokens}>
      <WindowFigureGrid>
        <StatTile value={`${Math.round(metrics?.completionRate ?? 0)}%`} label={t('progressScreen.window.completionRate')} />
        <StatTile value={metrics?.activeDays ?? 0} label={t('progressScreen.window.activeDays')} />
        {bestWeekday
          ? <StatTile value={t(`dates.daysLong.${bestWeekday}`)} label={t('progressScreen.window.bestWeekday')} />
          : <StatTile state="empty" emptyLabel={t('progressScreen.window.bestWeekdayEmpty')} label={t('progressScreen.window.bestWeekday')} />}
        {topHabit
          ? <StatTile value={topHabit.name} label={t('progressScreen.window.topHabit')} />
          : <StatTile state="empty" emptyLabel={t('progressScreen.window.topHabitEmpty')} label={t('progressScreen.window.topHabit')} />}
      </WindowFigureGrid>
    </WindowFrame>
  )
}

const ACHIEVEMENT_GLYPHS: Record<
  ReturnType<typeof achievementGlyphKey>,
  ComponentType<IconProps>
> = {
  calendar: Calendar,
  flame: Flame,
  satellite: Satellite,
  shield: Shield,
  star: Star,
  sun: Sun,
  target: Target,
  trophy: Trophy,
  zap: Zap,
}

function AchievementMark({ achievement, name, tokens }: Readonly<{ achievement: Achievement; name: string; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const Glyph = ACHIEVEMENT_GLYPHS[achievementGlyphKey(achievement.iconKey)]
  return <View accessibilityRole="image" accessibilityLabel={t(achievement.isEarned ? 'progressScreen.achievements.earnedState' : 'progressScreen.achievements.unearnedState', { name })} style={[styles.achievementMark, achievement.isEarned ? { backgroundColor: tokens.statusDone } : { borderColor: tokens.hairlineStrong, borderWidth: 1.5 }]} testID={`achievement-mark-${achievement.isEarned ? 'earned' : 'unearned'}`}><Glyph size={20} strokeWidth={2} color={achievement.isEarned ? tokens.bg : tokens.fg3} /></View>
}

function AchievementTile({ achievement, tokens, wide }: Readonly<{ achievement: Achievement; tokens: AppTokensV2; wide: boolean }>) {
  const { t } = useTranslation()
  const current = achievement.progressCurrent
  const target = achievement.progressTarget
  const hasProgress = current != null && target != null
  const name = t(`gamification.achievements.${achievement.id}.name`)
  return (
    <View style={[styles.achievement, wide ? styles.achievementWide : undefined, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]} testID={`achievement-tile-${achievement.id}`}>
      <View style={styles.achievementHeader}>
        <AchievementMark achievement={achievement} name={name} tokens={tokens} />
        <View style={styles.achievementCopy}>
          <Text style={[styles.achievementName, { color: achievement.isEarned ? tokens.fg1 : tokens.fg2 }]}>{name}</Text>
          <Text style={[styles.achievementBody, { color: tokens.fg3 }]}>{t(`gamification.achievements.${achievement.id}.description`)}</Text>
        </View>
        {achievement.isEarned ? <Badge>{t('progressScreen.achievements.earnedLabel')}</Badge> : null}
      </View>
      {hasProgress ? <View style={styles.achievementProgress}><ProgressBar value={current} max={target} label={t('progressScreen.achievements.progressLabel', { name, current, target })} /><Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.achievements.progress', { current, target })}</Text></View> : null}
    </View>
  )
}

function AchievementsSection({ profile, xpProgress, tokens }: Readonly<{ profile: ReturnType<typeof useGamificationProfile>['profile']; xpProgress: number; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  if (!profile) return null
  const achievements = visibleProgressAchievements(profile.achievements)
  const categories = Array.from(new Set(achievements.map((achievement) => achievement.category)))
  const levelTitle = t(getGamificationLevelTitleKey(profile.level))
  const wide = width >= 768
  return (
    <>
      <View style={styles.xpSummary} testID="progress-xp-summary">
        <View style={styles.xpRow}><Text style={[styles.progressTitle, { color: tokens.fg1 }]}>{t('progressScreen.achievements.level', { level: profile.level, title: levelTitle })}</Text><Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })}</Text></View>
        <ProgressBar value={xpProgress} max={100} label={t('progressScreen.achievements.xpProgress')} />
      </View>
      <Section compact title={t('progressScreen.sections.achievements')} tokens={tokens}>
        {achievements.length === 0 ? <EmptyState title={t('progressScreen.achievements.empty')} /> : categories.map((category) => <View key={category} style={styles.achievementCategory}><Text accessibilityRole="header" style={[styles.achievementCategoryTitle, { color: tokens.fg2 }]} testID="achievement-category">{t(`gamification.categories.${category}`)}</Text><View style={styles.achievementGrid}>{achievements.filter((achievement) => achievement.category === category).map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} tokens={tokens} wide={wide} />)}</View></View>)}
      </Section>
    </>
  )
}

function ProgressLoading({ label }: Readonly<{ label: string }>) {
  const { width } = useWindowDimensions()
  const columns = width >= 768 ? 4 : 2
  return (
    <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <View style={styles.loadingSettings} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} variant="settings" label={label} />)}
      </View>
      <View style={styles.loadingRows} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 4 / columns }, (_, row) => (
          <View key={row} style={styles.loadingTileRow}>
            {Array.from({ length: columns }, (_, column) => (
              <View key={column} style={styles.loadingTile}><Skeleton variant="stat-tile" label={label} /></View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.loadingRows} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} variant="habit-row" label={label} />)}
      </View>
    </View>
  )
}

export function ProgressContent() {
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const { t } = useTranslation()
  const router = useRouter()
  const theme = useAppTheme()
  const tokens = useMemo(() => createTokensV2(theme.currentScheme, theme.currentTheme), [theme.currentScheme, theme.currentTheme])
  const account = useProfile()
  const canView = account.profile?.canViewGamification ?? false
  const goals = useGoals()
  const gamification = useGamificationProfile(canView)
  const allGoals = goals.data?.allGoals ?? []
  const { error, loading, empty } = deriveProgressViewState({ goalCount: allGoals.length, account, goals, gamification, canView })
  const retry = () => {
    void account.refetch()
    void goals.refetch()
    if (canView) void gamification.refetch()
  }
  return (
    <>
      {detailGoalId ? <ScrollView style={[styles.root, { backgroundColor: tokens.bg }]} contentContainerStyle={styles.content}><GoalDetailDrawer key={detailGoalId} inline open onClose={() => setDetailGoalId(null)} goalId={detailGoalId} /></ScrollView> : null}
    <NestableScrollContainer style={[styles.root, { backgroundColor: tokens.bg }, detailGoalId ? { display: 'none' } : undefined]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text accessible accessibilityRole="header" style={styles.screenReaderTitle}>{t('progressScreen.title')}</Text>
      {loading ? <ProgressLoading label={t('progressScreen.loading')} /> : null}
      {error ? <View style={styles.error}><ErrorState message={t('progressScreen.error')} action={<PillButton variant="ghost" size="sm" onClick={retry}>{t('progressScreen.retry')}</PillButton>} /></View> : null}
      {empty ? <View style={styles.empty}><EmptyState title={t('progressScreen.empty')} action={<PillButton variant="ghost" size="sm" onClick={() => router.push('/')}>{t('progressScreen.emptyAction')}</PillButton>} /></View> : null}
      {!loading && !error && !empty ? <><StreakSection accountProfile={account.profile} canView={canView} gamificationProfile={gamification.profile} tokens={tokens} /><GoalsSection onOpenGoal={setDetailGoalId} goals={allGoals} tokens={tokens} /><WindowSection hasProAccess={account.profile?.hasProAccess ?? false} tokens={tokens} /><AchievementsSection profile={gamification.profile} xpProgress={gamification.xpProgress} tokens={tokens} /></> : null}
    </NestableScrollContainer>
    </>
  )
}

const styles = StyleSheet.create({
  screenReaderTitle: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' },
  root: { flex: 1 }, content: { gap: 32, paddingBottom: 48, paddingHorizontal: 16, paddingTop: 16 },
  loading: { gap: 32 }, loadingRows: { gap: 12 }, loadingSettings: { gap: 12, width: '100%', maxWidth: 560 },
  loadingTileRow: { flexDirection: 'row', gap: 12 }, loadingTile: { flex: 1, minWidth: 0 },
  error: { width: '100%', maxWidth: 620 }, empty: { paddingTop: 48 },
  section: { gap: 16 }, compactSection: { gap: 12 }, sectionTitle: { fontFamily: 'Geist_500Medium', fontSize: 20, lineHeight: 24 }, compactTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
  streakSection: { width: '100%', maxWidth: 560, gap: 12 },
  streakFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  streakLabel: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24 },
  frozenBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12 },
  frozenCopy: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  streak: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 60, fontVariant: ['tabular-nums'], lineHeight: 60, letterSpacing: -1.8 },
  copy: { gap: 4 }, body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 }, meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16 },
  notice: { borderRadius: 12, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingVertical: 12 },
  card: { borderRadius: 20, borderWidth: 1, gap: 12, padding: 16 }, cardTitle: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 20 }, actionStart: { alignSelf: 'flex-start' }, lockHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, half: { width: '48%' },
  windowGrid: { gap: 12 }, windowLock: { maxWidth: 560 }, windowRow: { flexDirection: 'row', gap: 12 }, windowSection: { gap: 12 }, windowTile: { flex: 1, minWidth: 0 },
  goalsSection: { gap: 12 }, goalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, borderWidth: 1 },
  goalTitle: { fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 24 }, goalMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  goalCopy: { flex: 1, minWidth: 0, gap: 4 }, goalSeparator: { height: 12 },
  emptyLine: { alignItems: 'flex-start', gap: 12, paddingVertical: 24 },
  achievement: { borderRadius: 20, borderWidth: 1, gap: 12, minWidth: 0, padding: 16, width: '100%' }, achievementWide: { width: '48%' },
  achievementCategory: { gap: 12 }, achievementCategoryTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20, paddingTop: 4 }, achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  achievementHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 }, achievementCopy: { flex: 1, gap: 4, minWidth: 0 }, achievementMark: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  achievementName: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19 }, achievementBody: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 17 }, achievementProgress: { gap: 4 },
  xpSummary: { gap: 12, maxWidth: 560, width: '100%' }, xpRow: { alignItems: 'baseline', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, progressTitle: { flex: 1, fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 22 },
})
