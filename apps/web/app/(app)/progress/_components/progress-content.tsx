'use client'

import {
  useMemo,
  useState,
  type ComponentType,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
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

function Section({ title, children, compact = false }: Readonly<{ title: string; children: ReactNode; compact?: boolean }>) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <h2 className={compact ? 'text-[14px] font-medium text-[var(--fg-2)]' : 'text-[20px] font-medium text-[var(--fg-1)]'}>{title}</h2>
      {children}
    </section>
  )
}

function LockedCard({ title, body, action }: Readonly<{ title: string; body: string; action: string }>) {
  const router = useRouter()
  return (
    <div className="flex flex-col items-start gap-3 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <div className="flex items-center gap-3">
        <Lock size={20} strokeWidth={2} aria-hidden="true" className="text-[var(--fg-2)]" />
        <ProBadge alwaysVisible />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[16px] font-medium text-[var(--fg-1)]">{title}</p>
        <p className="text-[14px] text-[var(--fg-3)]">{body}</p>
      </div>
      <PillButton variant="ghost" size="sm" onClick={() => router.push('/upgrade')}>{action}</PillButton>
    </div>
  )
}

function ProgressLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex flex-col gap-6 py-8">
      <Skeleton variant="stat-tile" label={label} />
      <Skeleton variant="habit-row" label={label} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" label={label} />)}
      </div>
    </div>
  )
}

function StreakSection({ accountProfile, canView, gamificationProfile }: Readonly<{
  accountProfile: ReturnType<typeof useProfile>['profile']
  canView: boolean
  gamificationProfile: ReturnType<typeof useGamificationProfile>['profile']
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const freeze = useStreakFreeze(accountProfile, canView)
  const repair = useRepairStreak()
  const currentStreak = freeze.streakInfo?.currentStreak ?? gamificationProfile?.currentStreak ?? accountProfile?.currentStreak ?? 0
  const longestStreak = freeze.streakInfo?.longestStreak ?? gamificationProfile?.longestStreak ?? accountProfile?.longestStreak ?? 0
  const days = buildStreakWeekDays(freeze.streakInfo, currentStreak, freeze.isFrozenToday)
  const labels = useMemo(() => days.map((day) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date)), [days, locale])
  const tier = t(getStreakTierLabelKey(currentStreak))
  const hasOpenYesterday = isRepairableStreakGap(freeze.streakInfo?.lastActiveDate, currentStreak)
  const available = freeze.freezesAvailable
  const canRepair = freeze.streakInfo?.isRepairAvailable === true && available > 0
  const dayWords = {
    active: t('progressScreen.streak.active'),
    frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'),
    today: t('progressScreen.streak.today'),
  }

  return (
    <Section title={t('progressScreen.sections.streak')}>
      <div className="flex flex-col gap-1">
        <p className="font-[var(--font-display)] text-[60px] font-medium leading-[64px] tabular-nums text-[var(--fg-1)]">{t('progressScreen.streak.current', { count: currentStreak })}</p>
        <p className="text-[14px] text-[var(--fg-3)]">{t('progressScreen.streak.currentLabel')}</p>
      </div>
      {freeze.isFrozenToday ? <p className="rounded-[12px] bg-[var(--bg-field)] px-4 py-3 text-[14px] text-[var(--fg-2)]">{t('progressScreen.streak.frozenToday')}</p> : null}
      <div className="max-w-full overflow-x-auto py-1">
        <DayStrip scope="account" days={days.map((day) => day.status)} labels={labels} label={t('progressScreen.streak.stripWindow', { count: days.length })} words={dayWords} />
      </div>
      {hasOpenYesterday ? (
        <div className="flex flex-col items-start gap-3 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <div className="flex flex-col gap-1">
            <p className="text-[16px] font-medium text-[var(--fg-1)]">{t('progressScreen.streak.repairTitle')}</p>
            <p className="text-[14px] text-[var(--fg-3)]">{canRepair ? t('progressScreen.streak.repairBody', { count: available }) : t('progressScreen.streak.repairEmpty', { count: freeze.daysUntilNextFreeze })}</p>
          </div>
          {canRepair ? <PillButton loading={repair.isPending} onClick={() => repair.mutate()}>{t('progressScreen.streak.repairAction')}</PillButton> : null}
          {repair.isError ? <p role="alert" className="text-[14px] text-[var(--status-bad)]">{t('progressScreen.streak.repairError')}</p> : null}
        </div>
      ) : null}
      {canView && freeze.streakInfo ? (
        <FreezeBank
          banked={freeze.streakFreezesAccumulated}
          ceiling={freeze.maxStreakFreezesAccumulated}
          usedThisMonth={freeze.freezesUsedThisMonth}
          monthlyUseCeiling={freeze.maxFreezesPerMonth}
          daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)}
          earnRateDays={7}
          tierValue={tier}
          tierLabel={t('streakDisplay.detail.tierTileLabel')}
          protectedDays={buildProtectedDayLabels(freeze.streakInfo.recentFreezeDates)}
          words={{
            ...dayWords,
            legendLabel: t('progressScreen.streak.legend'), disclosureCollapsed: t('progressScreen.streak.showFreeze'), disclosureExpanded: t('progressScreen.streak.hideFreeze'),
            bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'),
            nextFreezeInDays: t('progressScreen.streak.nextIn', { count: freeze.daysUntilNextFreeze }), capacityMessage: t('progressScreen.streak.capacity'),
            protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday'),
          }}
        />
      ) : <LockedCard title={t('progressScreen.streak.lockedTitle')} body={t('progressScreen.streak.lockedBody')} action={t('progressScreen.streak.lockedAction')} />}
      <div className="grid grid-cols-2 gap-3">
        <StatTile value={longestStreak} label={t('progressScreen.streak.longest')} />
      </div>
    </Section>
  )
}

function GoalIndicator({ goal, achieved }: Readonly<{ goal: Goal; achieved: boolean }>) {
  const t = useTranslations()
  if (goal.status === 'Completed') {
    return <StatusRing status="done" size={48} label={t('goals.status.completed')} />
  }
  if (goal.status !== 'Active') return null
  return <ProgressRing value={achieved ? 100 : goal.progressPercentage} size={48} label={t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })} />
}

function GoalDeadlineLine({ deadline }: Readonly<{ deadline: ReturnType<typeof getGoalDeadlinePresentation> }>) {
  const t = useTranslations()
  if (!deadline) return null
  const color = deadline.state === 'overdue'
    ? 'var(--status-bad-text)'
    : deadline.state === 'dueToday' || deadline.state === 'soon'
      ? 'var(--status-overdue-text)'
      : 'var(--fg-3)'
  const copy = deadline.state === 'dueToday'
    ? t('progressScreen.goals.dueToday')
    : deadline.state === 'overdue'
      ? t('progressScreen.goals.daysOverdue', { count: deadline.days })
      : t('progressScreen.goals.daysLeft', { count: deadline.days })
  return <p className="text-[12px]" style={{ color }}>{copy}</p>
}

function FinishGoalAction({ goal }: Readonly<{ goal: Goal }>) {
  const t = useTranslations()
  const updateStatus = useUpdateGoalStatus()
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-[12px] text-[var(--fg-3)]">{t('progressScreen.goals.finishReason')}</p>
      <PillButton variant="secondary" size="sm" loading={updateStatus.isPending} onClick={() => updateStatus.mutate({ goalId: goal.id, goalName: goal.title, data: { status: 'Completed' } })}>{t('progressScreen.goals.finish')}</PillButton>
    </div>
  )
}

function GoalCard({ goal, index, allGoals, canReorder, onDragStart, onDragOver, onDrop, onOpen }: Readonly<{
  goal: Goal
  index: number
  allGoals: readonly Goal[]
  canReorder: boolean
  onDragStart: () => void
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void
  onDrop: () => void
  onOpen: () => void
}>) {
  const t = useTranslations()
  const reorder = useReorderGoals()
  const tracking = getGoalMetricsStatusPresentation(goal.trackingStatus)
  const achieved = goal.status === 'Active' && goal.progressPercentage >= 100
  const deadline = getGoalDeadlinePresentation(goal.deadline, goal.status)
  const commitMove = (target: number) => {
    const positions = buildGoalMovePositions(allGoals, goal.id, target)
    if (positions) reorder.mutate(positions)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    commitMove(index + (event.key === 'ArrowUp' ? -1 : 1))
  }

  return (
    <article className="flex flex-col gap-3 rounded-[20px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <button type="button" draggable={canReorder} aria-label={goal.title} aria-roledescription={canReorder ? t('goals.dragItem') : undefined} aria-keyshortcuts={canReorder ? 'Alt+ArrowUp Alt+ArrowDown' : undefined} onKeyDown={canReorder ? handleKeyDown : undefined} onDragStart={canReorder ? onDragStart : undefined} onDragOver={canReorder ? onDragOver : undefined} onDrop={canReorder ? onDrop : undefined} onClick={onOpen} className="flex w-full cursor-pointer flex-col gap-3 rounded-[12px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
        <div className="flex items-center gap-4">
          <GoalIndicator goal={goal} achieved={achieved} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-medium text-[var(--fg-1)]">{goal.title}</p>
            {goal.status !== 'Abandoned' ? <p className="text-[12px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</p> : null}
          </div>
          <span className="text-[12px] text-[var(--fg-3)]">{achieved ? t('goals.status.achieved') : t(`goals.status.${goal.status.toLowerCase()}`)}</span>
        </div>
        {goal.status === 'Active' && tracking ? <p className="text-[12px] text-[var(--fg-3)]">{t(tracking.labelKey)}</p> : null}
        <GoalDeadlineLine deadline={deadline} />
      </button>
      {achieved ? <FinishGoalAction goal={goal} /> : null}
    </article>
  )
}

function GoalsSection({ goals }: Readonly<{ goals: readonly Goal[] }>) {
  const t = useTranslations()
  const router = useRouter()
  const reorder = useReorderGoals()
  const [filter, setFilter] = useState<ProgressGoalFilter>('all')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const filtered = filterProgressGoals(goals, filter)
  const options = [
    { id: 'all', label: t('progressScreen.goals.all') }, { id: 'active', label: t('progressScreen.goals.active') },
    { id: 'completed', label: t('progressScreen.goals.completed') }, { id: 'abandoned', label: t('progressScreen.goals.abandoned') },
  ] as const
  return (
    <Section title={t('progressScreen.sections.goals')}>
      {goals.length > 0 ? <SegmentedControl options={options} value={filter} onChange={(id) => setFilter(id as ProgressGoalFilter)} label={t('progressScreen.goals.views')} /> : null}
      {goals.length === 0 ? <EmptyState title={t('progressScreen.goals.empty')} action={<PillButton variant="ghost" onClick={() => router.push('/')}>{t('progressScreen.startHabit')}</PillButton>} /> : null}
      {goals.length > 0 && filtered.length === 0 ? <div className="flex flex-col items-start gap-3 py-6"><p className="text-[14px] text-[var(--fg-3)]">{t('progressScreen.goals.filterEmpty')}</p><PillButton variant="ghost" size="sm" onClick={() => setFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></div> : null}
      {filtered.length > 0 ? (
        <div className="flex flex-col gap-3">
          {filtered.map((goal) => {
            const index = goals.findIndex((item) => item.id === goal.id)
            return <GoalCard key={goal.id} goal={goal} index={index} allGoals={goals} canReorder={filter === 'all'} onDragStart={() => setDraggedId(goal.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (!draggedId) return; const positions = buildGoalMovePositions(goals, draggedId, index); if (positions) reorder.mutate(positions); setDraggedId(null) }} onOpen={() => setDetailGoalId(goal.id)} />
          })}
        </div>
      ) : null}
      {detailGoalId ? <GoalDetailDrawer open onOpenChange={(open) => { if (!open) setDetailGoalId(null) }} goalId={detailGoalId} /> : null}
    </Section>
  )
}

function WindowSection({ canView }: Readonly<{ canView: boolean }>) {
  const t = useTranslations()
  const retrospective = useProgressRetrospective(canView)
  if (!canView) return <Section title={t('progressScreen.sections.window')}><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} /></Section>
  if (!retrospective.data) return <Section title={t('progressScreen.sections.window')}><Skeleton variant="stat-tile" label={t('progressScreen.loading')} /></Section>
  const metrics = retrospective.data.metrics
  const topHabit = metrics.topHabits[0]
  return (
    <Section title={t('progressScreen.sections.window')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile value={`${Math.round(metrics.completionRate)}%`} label={t('progressScreen.window.completionRate')} />
        <StatTile value={`${metrics.activeDays} / ${metrics.periodDays}`} label={t('progressScreen.window.activeDays', { days: metrics.periodDays })} />
        {topHabit ? <StatTile value={topHabit.name} label={t('progressScreen.window.topHabit')} /> : <StatTile state="empty" emptyLabel={t('progressScreen.window.topHabitEmpty')} label={t('progressScreen.window.topHabit')} />}
        <StatTile value={metrics.totalCompletions} label={t('progressScreen.window.totalCompletions')} />
      </div>
    </Section>
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

function AchievementMark({ achievement }: Readonly<{ achievement: Achievement }>) {
  const t = useTranslations()
  const Glyph = ACHIEVEMENT_GLYPHS[achievementGlyphKey(achievement.iconKey)]
  return (
    <span
      role="img"
      aria-label={achievement.isEarned ? t('goals.status.completed') : t('goals.status.active')}
      className={`inline-flex size-[30px] items-center justify-center rounded-full ${achievement.isEarned ? 'bg-[var(--fg-1)]' : 'shadow-[inset_0_0_0_1px_var(--hairline-strong)]'}`}
    >
      <Glyph
        size={16}
        strokeWidth={2}
        color={achievement.isEarned ? 'var(--bg)' : 'var(--fg-3)'}
      />
    </span>
  )
}

function AchievementTile({ achievement }: Readonly<{ achievement: Achievement }>) {
  const t = useTranslations()
  const locale = useLocale()
  const current = achievement.progressCurrent
  const target = achievement.progressTarget
  const date = achievement.earnedAtUtc ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(achievement.earnedAtUtc)) : null
  return (
    <div className="flex min-h-[156px] flex-col gap-2 rounded-[16px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <AchievementMark achievement={achievement} />
      <p className="text-[12px] font-medium text-[var(--fg-1)]">{t(`gamification.achievements.${achievement.id}.name`)}</p>
      <p className="text-[11px] leading-[16px] text-[var(--fg-3)]">{t(`gamification.achievements.${achievement.id}.description`)}</p>
      {current != null && target != null ? <ProgressBar value={current} max={target} label={t('progressScreen.achievements.progress', { current, target })} /> : null}
      {date ? <p className="mt-auto text-[11px] tabular-nums text-[var(--fg-4)]">{t('progressScreen.achievements.earned', { date })}</p> : null}
    </div>
  )
}

function AchievementsSection({ profile, canView, xpProgress }: Readonly<{ profile: ReturnType<typeof useGamificationProfile>['profile']; canView: boolean; xpProgress: number }>) {
  const t = useTranslations()
  if (!canView || !profile) return <Section compact title={t('progressScreen.sections.achievements')}><LockedCard title={t('progressScreen.achievements.lockedTitle')} body={t('progressScreen.achievements.lockedBody')} action={t('progressScreen.achievements.lockedAction')} /></Section>
  const achievements = visibleProgressAchievements(profile.achievements)
  const categories = Array.from(new Set(achievements.map((achievement) => achievement.category)))
  const levelTitle = t(getGamificationLevelTitleKey(profile.level))
  const nextLevelTitle = t(getGamificationLevelTitleKey(profile.nextReward.nextLevel))
  return (
    <Section compact title={t('progressScreen.sections.achievements')}>
      <div className="flex flex-col gap-2 rounded-[20px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <div className="flex items-baseline justify-between gap-3"><p className="text-[14px] font-medium text-[var(--fg-1)]">{t('progressScreen.achievements.level', { level: profile.level, title: levelTitle })}</p><p className="text-[12px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })}</p></div>
        <ProgressBar value={xpProgress} max={100} label={t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })} />
        <p className="text-[11px] text-[var(--fg-3)]">{t('progressScreen.achievements.next', { level: profile.nextReward.nextLevel, title: nextLevelTitle, xp: profile.nextReward.xpToNextLevel })}</p>
      </div>
      {achievements.length === 0 ? <EmptyState title={t('progressScreen.achievements.empty')} /> : categories.map((category) => <div key={category} className="flex flex-col gap-3"><h3 className="text-[12px] font-medium text-[var(--fg-2)]">{t(`gamification.categories.${category}`)}</h3><div className="grid grid-cols-1 gap-3 md:grid-cols-2">{achievements.filter((achievement) => achievement.category === category).map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} />)}</div></div>)}
    </Section>
  )
}

export function ProgressContent() {
  const t = useTranslations()
  const router = useRouter()
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
  return (
    <main className="flex w-full flex-col gap-8 px-4 py-8 md:px-0">
      <h1 className="t-h1" tabIndex={-1}>{t('progressScreen.title')}</h1>
      {loading ? <ProgressLoading label={t('progressScreen.loading')} /> : null}
      {!loading && error ? <ErrorState message={t('progressScreen.error')} action={<PillButton variant="ghost" onClick={retry}>{t('progressScreen.retry')}</PillButton>} /> : null}
      {!loading && !error && empty ? <EmptyState title={t('progressScreen.empty')} action={<PillButton onClick={() => router.push('/')}>{t('progressScreen.startHabit')}</PillButton>} /> : null}
      {!loading && !error && !empty ? <><StreakSection accountProfile={account.profile} canView={canView} gamificationProfile={gamification.profile} /><GoalsSection goals={allGoals} /><WindowSection canView={canView} /><AchievementsSection profile={gamification.profile} canView={canView} xpProgress={gamification.xpProgress} /></> : null}
    </main>
  )
}
