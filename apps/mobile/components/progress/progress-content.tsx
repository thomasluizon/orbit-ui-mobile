import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { Achievement } from '@orbit/shared/types/gamification'
import type { Goal } from '@orbit/shared/types/goal'
import {
  achievementGlyphKey,
  buildGoalMovePositions,
  buildProtectedDayLabels,
  buildStreakWeekDays,
  filterProgressGoals,
  getGoalMetricsStatusPresentation,
  getGoalDeadlinePresentation,
  getGamificationLevelTitleKey,
  getStreakTierLabelKey,
  isProgressSurfaceEmpty,
  isRepairableStreakGap,
  visibleProgressAchievements,
  type ProgressGoalFilter,
} from '@orbit/shared/utils'
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
import { useGoals, useReorderGoals, useUpdateGoalStatus } from '@/hooks/use-goals'
import { useProfile } from '@/hooks/use-profile'
import { useProgressRetrospective } from '@/hooks/use-retrospective'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useAppTheme } from '@/lib/use-app-theme'

function Section({ title, children, tokens, compact = false }: Readonly<{ title: string; children: ReactNode; tokens: AppTokensV2; compact?: boolean }>) {
  return <View accessibilityLabel={title} style={styles.section}><Text accessibilityRole="header" style={[compact ? styles.compactTitle : styles.sectionTitle, { color: compact ? tokens.fg2 : tokens.fg1 }]}>{title}</Text>{children}</View>
}

function LockedCard({ title, body, action, tokens }: Readonly<{ title: string; body: string; action: string; tokens: AppTokensV2 }>) {
  const router = useRouter()
  return (
    <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <View style={styles.lockHeader}><Lock size={20} strokeWidth={2} color={tokens.fg2} /><ProBadge alwaysVisible /></View>
      <View style={styles.copy}><Text style={[styles.cardTitle, { color: tokens.fg1 }]}>{title}</Text><Text style={[styles.body, { color: tokens.fg3 }]}>{body}</Text></View>
      <View style={styles.actionStart}><PillButton variant="ghost" size="sm" onClick={() => router.push(buildUpgradeHref('/progress'))}>{action}</PillButton></View>
    </View>
  )
}

function StreakSection({ accountProfile, canView, gamificationProfile, tokens }: Readonly<{
  accountProfile: ReturnType<typeof useProfile>['profile']; canView: boolean; gamificationProfile: ReturnType<typeof useGamificationProfile>['profile']; tokens: AppTokensV2
}>) {
  const { t, i18n } = useTranslation()
  const freeze = useStreakFreeze(accountProfile, canView)
  const repair = useRepairStreak()
  const currentStreak = freeze.streakInfo?.currentStreak ?? gamificationProfile?.currentStreak ?? accountProfile?.currentStreak ?? 0
  const longestStreak = freeze.streakInfo?.longestStreak ?? gamificationProfile?.longestStreak ?? accountProfile?.longestStreak ?? 0
  const days = buildStreakWeekDays(freeze.streakInfo, currentStreak, freeze.isFrozenToday)
  const labels = useMemo(() => days.map((day) => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(day.date)), [days, i18n.language])
  const tier = t(getStreakTierLabelKey(currentStreak))
  const hasOpenYesterday = isRepairableStreakGap(freeze.streakInfo?.lastActiveDate, currentStreak)
  const canRepair = freeze.streakInfo?.isRepairAvailable === true && freeze.freezesAvailable > 0
  const dayWords = { active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'), missed: t('progressScreen.streak.missed'), today: t('progressScreen.streak.today') }
  return (
    <Section title={t('progressScreen.sections.streak')} tokens={tokens}>
      <View style={styles.copy}><Text style={[styles.streak, { color: tokens.fg1 }]}>{t('progressScreen.streak.current', { count: currentStreak })}</Text><Text style={[styles.body, { color: tokens.fg3 }]}>{t('progressScreen.streak.currentLabel')}</Text></View>
      {freeze.isFrozenToday ? <Text style={[styles.notice, { backgroundColor: tokens.bgField, color: tokens.fg2 }]}>{t('progressScreen.streak.frozenToday')}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><DayStrip scope="account" days={days.map((day) => day.status)} labels={labels} label={t('progressScreen.streak.stripWindow', { count: days.length })} words={dayWords} /></ScrollView>
      {hasOpenYesterday ? <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}><View style={styles.copy}><Text style={[styles.cardTitle, { color: tokens.fg1 }]}>{t('progressScreen.streak.repairTitle')}</Text><Text style={[styles.body, { color: tokens.fg3 }]}>{canRepair ? t('progressScreen.streak.repairBody', { count: freeze.freezesAvailable }) : t('progressScreen.streak.repairEmpty', { count: freeze.daysUntilNextFreeze })}</Text></View>{canRepair ? <View style={styles.actionStart}><PillButton loading={repair.isPending} onClick={() => repair.mutate()}>{t('progressScreen.streak.repairAction')}</PillButton></View> : null}{repair.isError ? <Text accessibilityRole="alert" style={[styles.body, { color: tokens.statusBad }]}>{t('progressScreen.streak.repairError')}</Text> : null}</View> : null}
      {canView && freeze.streakInfo ? <FreezeBank banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} usedThisMonth={freeze.freezesUsedThisMonth} monthlyUseCeiling={freeze.maxFreezesPerMonth} daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)} earnRateDays={7} tierValue={tier} tierLabel={t('streakDisplay.detail.tierTileLabel')} protectedDays={buildProtectedDayLabels(freeze.streakInfo.recentFreezeDates)} words={{ ...dayWords, legendLabel: t('progressScreen.streak.legend'), disclosureCollapsed: t('progressScreen.streak.showFreeze'), disclosureExpanded: t('progressScreen.streak.hideFreeze'), bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'), nextFreezeInDays: t('progressScreen.streak.nextIn', { count: freeze.daysUntilNextFreeze }), capacityMessage: t('progressScreen.streak.capacity'), protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday') }} /> : <LockedCard title={t('progressScreen.streak.lockedTitle')} body={t('progressScreen.streak.lockedBody')} action={t('progressScreen.streak.lockedAction')} tokens={tokens} />}
      <View style={styles.half}><StatTile value={longestStreak} label={t('progressScreen.streak.longest')} /></View>
    </Section>
  )
}

function GoalIndicator({ goal }: Readonly<{ goal: Goal }>) {
  const { t } = useTranslation()
  if (goal.status === 'Completed') {
    return <StatusRing status="done" size={48} label={t('goals.status.completed')} />
  }
  if (goal.status !== 'Active') return null
  return <ProgressRing value={goal.progressPercentage} size={48} label={t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })} />
}

function GoalDeadlineLine({ deadline, tokens }: Readonly<{ deadline: ReturnType<typeof getGoalDeadlinePresentation>; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  if (!deadline) return null
  const color = deadline.state === 'overdue'
    ? tokens.statusBadText
    : deadline.state === 'dueToday' || deadline.state === 'soon'
      ? tokens.statusOverdueText
      : tokens.fg3
  const copy = deadline.state === 'dueToday'
    ? t('progressScreen.goals.dueToday')
    : deadline.state === 'overdue'
      ? t('progressScreen.goals.daysOverdue', { count: deadline.days })
      : t('progressScreen.goals.daysLeft', { count: deadline.days })
  return <Text style={[styles.meta, { color }]}>{copy}</Text>
}

function FinishGoalAction({ goal, tokens }: Readonly<{ goal: Goal; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const updateStatus = useUpdateGoalStatus()
  return <View style={styles.copy}><Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.goals.finishReason')}</Text><View style={styles.actionStart}><PillButton variant="secondary" size="sm" loading={updateStatus.isPending} onClick={() => updateStatus.mutate({ goalId: goal.id, goalName: goal.title, data: { status: 'Completed' } })}>{t('progressScreen.goals.finish')}</PillButton></View></View>
}

function GoalCard({ goal, index, allGoals, canReorder, onOpen, tokens }: Readonly<{ goal: Goal; index: number; allGoals: readonly Goal[]; canReorder: boolean; onOpen: () => void; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const reorder = useReorderGoals()
  const achieved = goal.status === 'Active' && goal.progressPercentage >= 100
  const tracking = getGoalMetricsStatusPresentation(goal.trackingStatus)
  const deadline = getGoalDeadlinePresentation(goal.deadline, goal.status)
  const move = (offset: number) => { const positions = buildGoalMovePositions(allGoals, goal.id, index + offset); if (positions) reorder.mutate(positions) }
  return (
    <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Pressable accessible accessibilityRole="button" accessibilityLabel={goal.title} accessibilityHint={canReorder ? t('progressScreen.goals.reorderHint') : undefined} accessibilityActions={canReorder ? [{ name: 'decrement', label: t('progressScreen.goals.moveUp') }, { name: 'increment', label: t('progressScreen.goals.moveDown') }] : undefined} onAccessibilityAction={canReorder ? (event) => move(event.nativeEvent.actionName === 'decrement' ? -1 : 1) : undefined} onPress={onOpen} style={({ pressed }) => [styles.goalButton, pressed ? styles.pressed : null]}>
        <View style={styles.goalRow}>
          <GoalIndicator goal={goal} />
          <View style={styles.goalCopy}><Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.fg1 }]}>{goal.title}</Text>{goal.status !== 'Abandoned' ? <Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</Text> : null}</View>
          <Text style={[styles.meta, { color: tokens.fg3 }]}>{achieved ? t('goals.status.achieved') : t(`goals.status.${goal.status.toLowerCase()}`)}</Text>
        </View>
        {goal.status === 'Active' && tracking ? <Text style={[styles.meta, { color: tokens.fg3 }]}>{t(tracking.labelKey)}</Text> : null}
        <GoalDeadlineLine deadline={deadline} tokens={tokens} />
      </Pressable>
      {achieved ? <FinishGoalAction goal={goal} tokens={tokens} /> : null}
    </View>
  )
}

function GoalsSection({ goals, tokens }: Readonly<{ goals: readonly Goal[]; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const [filter, setFilter] = useState<ProgressGoalFilter>('all')
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const filtered = filterProgressGoals(goals, filter)
  const options = [{ id: 'all', label: t('progressScreen.goals.all') }, { id: 'active', label: t('progressScreen.goals.active') }, { id: 'completed', label: t('progressScreen.goals.completed') }, { id: 'abandoned', label: t('progressScreen.goals.abandoned') }] as const
  return (
    <Section title={t('progressScreen.sections.goals')} tokens={tokens}>
      {goals.length > 0 ? <SegmentedControl options={options} value={filter} onChange={(id) => setFilter(id as ProgressGoalFilter)} label={t('progressScreen.goals.views')} /> : null}
      {goals.length === 0 ? <EmptyState title={t('progressScreen.goals.empty')} action={<PillButton variant="ghost" onClick={() => router.push('/')}>{t('progressScreen.startHabit')}</PillButton>} /> : null}
      {goals.length > 0 && filtered.length === 0 ? <View style={styles.emptyLine}><Text style={[styles.body, { color: tokens.fg3 }]}>{t('progressScreen.goals.filterEmpty')}</Text><PillButton variant="ghost" size="sm" onClick={() => setFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></View> : null}
      {filtered.map((goal) => <GoalCard key={goal.id} goal={goal} index={goals.findIndex((item) => item.id === goal.id)} allGoals={goals} canReorder={filter === 'all'} onOpen={() => setDetailGoalId(goal.id)} tokens={tokens} />)}
      {detailGoalId ? <GoalDetailDrawer open onClose={() => setDetailGoalId(null)} goalId={detailGoalId} /> : null}
    </Section>
  )
}

function WindowSection({ canView, tokens }: Readonly<{ canView: boolean; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const retrospective = useProgressRetrospective(canView)
  if (!canView) return <Section title={t('progressScreen.sections.window')} tokens={tokens}><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} tokens={tokens} /></Section>
  if (!retrospective.data) return <Section title={t('progressScreen.sections.window')} tokens={tokens}><Skeleton variant="stat-tile" label={t('progressScreen.loading')} /></Section>
  const metrics = retrospective.data.metrics
  const topHabit = metrics.topHabits[0]
  return <Section title={t('progressScreen.sections.window')} tokens={tokens}><View style={styles.tileGrid}><View style={styles.half}><StatTile value={`${Math.round(metrics.completionRate)}%`} label={t('progressScreen.window.completionRate')} /></View><View style={styles.half}><StatTile value={`${metrics.activeDays} / ${metrics.periodDays}`} label={t('progressScreen.window.activeDays', { days: metrics.periodDays })} /></View><View style={styles.half}>{topHabit ? <StatTile value={topHabit.name} label={t('progressScreen.window.topHabit')} /> : <StatTile state="empty" emptyLabel={t('progressScreen.window.topHabitEmpty')} label={t('progressScreen.window.topHabit')} />}</View><View style={styles.half}><StatTile value={metrics.totalCompletions} label={t('progressScreen.window.totalCompletions')} /></View></View></Section>
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

function AchievementMark({ achievement, tokens }: Readonly<{ achievement: Achievement; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const Glyph = ACHIEVEMENT_GLYPHS[achievementGlyphKey(achievement.iconKey)]
  return <View accessibilityRole="image" accessibilityLabel={achievement.isEarned ? t('goals.status.completed') : t('goals.status.active')} style={[styles.achievementMark, achievement.isEarned ? { backgroundColor: tokens.fg1 } : { borderColor: tokens.hairlineStrong, borderWidth: 1 }]}><Glyph size={16} strokeWidth={2} color={achievement.isEarned ? tokens.bg : tokens.fg3} /></View>
}

function AchievementTile({ achievement, tokens }: Readonly<{ achievement: Achievement; tokens: AppTokensV2 }>) {
  const { t, i18n } = useTranslation()
  const current = achievement.progressCurrent
  const target = achievement.progressTarget
  const date = achievement.earnedAtUtc ? new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(achievement.earnedAtUtc)) : null
  return <View style={[styles.achievement, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}><AchievementMark achievement={achievement} tokens={tokens} /><Text style={[styles.achievementName, { color: tokens.fg1 }]}>{t(`gamification.achievements.${achievement.id}.name`)}</Text><Text style={[styles.achievementBody, { color: tokens.fg3 }]}>{t(`gamification.achievements.${achievement.id}.description`)}</Text>{current != null && target != null ? <ProgressBar value={current} max={target} label={t('progressScreen.achievements.progress', { current, target })} /> : null}{date ? <Text style={[styles.achievementBody, { color: tokens.fg4 }]}>{t('progressScreen.achievements.earned', { date })}</Text> : null}</View>
}

function AchievementsSection({ profile, canView, xpProgress, tokens }: Readonly<{ profile: ReturnType<typeof useGamificationProfile>['profile']; canView: boolean; xpProgress: number; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  if (!canView || !profile) return <Section compact title={t('progressScreen.sections.achievements')} tokens={tokens}><LockedCard title={t('progressScreen.achievements.lockedTitle')} body={t('progressScreen.achievements.lockedBody')} action={t('progressScreen.achievements.lockedAction')} tokens={tokens} /></Section>
  const achievements = visibleProgressAchievements(profile.achievements)
  const categories = Array.from(new Set(achievements.map((achievement) => achievement.category)))
  const levelTitle = t(getGamificationLevelTitleKey(profile.level))
  const nextLevelTitle = t(getGamificationLevelTitleKey(profile.nextReward.nextLevel))
  return <Section compact title={t('progressScreen.sections.achievements')} tokens={tokens}><View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}><View style={styles.xpRow}><Text style={[styles.progressTitle, { color: tokens.fg1 }]}>{t('progressScreen.achievements.level', { level: profile.level, title: levelTitle })}</Text><Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })}</Text></View><ProgressBar value={xpProgress} max={100} label={t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })} /><Text style={[styles.achievementBody, { color: tokens.fg3 }]}>{t('progressScreen.achievements.next', { level: profile.nextReward.nextLevel, title: nextLevelTitle, xp: profile.nextReward.xpToNextLevel })}</Text></View>{achievements.length === 0 ? <EmptyState title={t('progressScreen.achievements.empty')} /> : categories.map((category) => <View key={category} style={styles.copy}><Text style={[styles.compactTitle, { color: tokens.fg2 }]}>{t(`gamification.categories.${category}`)}</Text>{achievements.filter((achievement) => achievement.category === category).map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} tokens={tokens} />)}</View>)}</Section>
}

export function ProgressContent() {
  const { t } = useTranslation()
  const router = useRouter()
  const theme = useAppTheme()
  const tokens = useMemo(() => createTokensV2(theme.currentScheme, theme.currentTheme), [theme.currentScheme, theme.currentTheme])
  const account = useProfile()
  const canView = account.profile?.canViewGamification ?? false
  const goals = useGoals()
  const gamification = useGamificationProfile(canView)
  const retrospective = useProgressRetrospective(canView)
  const allGoals = goals.data?.allGoals ?? []
  const achievements = gamification.profile ? visibleProgressAchievements(gamification.profile.achievements) : []
  const loading = account.isLoading || goals.isLoading || (canView && (gamification.isLoading || retrospective.isLoading))
  const error = account.isError || goals.isError || (canView && (gamification.isError || retrospective.isError))
  const empty = canView && gamification.profile && retrospective.data ? isProgressSurfaceEmpty({ currentStreak: gamification.profile.currentStreak, goals: allGoals, achievements, totalCompletions: retrospective.data.metrics.totalCompletions }) : false
  const retry = () => { void account.refetch(); void goals.refetch(); void gamification.refetch(); void retrospective.refetch() }
  return <ScrollView style={[styles.root, { backgroundColor: tokens.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t('progressScreen.title')}</Text>{loading ? <View style={styles.section}><Skeleton variant="stat-tile" label={t('progressScreen.loading')} /><Skeleton variant="habit-row" label={t('progressScreen.loading')} /></View> : null}{!loading && error ? <ErrorState message={t('progressScreen.error')} action={<PillButton variant="ghost" onClick={retry}>{t('progressScreen.retry')}</PillButton>} /> : null}{!loading && !error && empty ? <EmptyState title={t('progressScreen.empty')} action={<PillButton onClick={() => router.push('/')}>{t('progressScreen.startHabit')}</PillButton>} /> : null}{!loading && !error && !empty ? <><StreakSection accountProfile={account.profile} canView={canView} gamificationProfile={gamification.profile} tokens={tokens} /><GoalsSection goals={allGoals} tokens={tokens} /><WindowSection canView={canView} tokens={tokens} /><AchievementsSection profile={gamification.profile} canView={canView} xpProgress={gamification.xpProgress} tokens={tokens} /></> : null}</ScrollView>
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { gap: 32, paddingBottom: 48, paddingHorizontal: 16, paddingTop: 32 },
  title: { fontFamily: 'Geist_600SemiBold', fontSize: 28, lineHeight: 32 },
  section: { gap: 16 }, sectionTitle: { fontFamily: 'Geist_500Medium', fontSize: 20, lineHeight: 24 }, compactTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
  streak: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 60, fontVariant: ['tabular-nums'], lineHeight: 64 },
  copy: { gap: 4 }, body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 }, meta: { fontFamily: 'RobotoMono_400Regular', fontSize: 12, lineHeight: 16 },
  notice: { borderRadius: 12, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingVertical: 12 },
  card: { borderRadius: 20, borderWidth: 1, gap: 12, padding: 16 }, cardTitle: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 20 }, actionStart: { alignSelf: 'flex-start' }, lockHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, half: { width: '48%' },
  goalButton: { gap: 12 }, goalRow: { alignItems: 'center', flexDirection: 'row', gap: 12 }, goalCopy: { flex: 1, gap: 4 }, pressed: { transform: [{ scale: 0.98 }] },
  emptyLine: { alignItems: 'flex-start', gap: 12, paddingVertical: 24 },
  achievement: { borderRadius: 16, borderWidth: 1, gap: 8, minHeight: 156, padding: 16 }, achievementMark: { alignItems: 'center', borderRadius: 16, height: 30, justifyContent: 'center', width: 30 },
  achievementName: { fontFamily: 'Geist_500Medium', fontSize: 12, lineHeight: 16 }, achievementBody: { fontFamily: 'Geist_400Regular', fontSize: 11, lineHeight: 16 },
  xpRow: { alignItems: 'baseline', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, progressTitle: { flex: 1, fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
})
