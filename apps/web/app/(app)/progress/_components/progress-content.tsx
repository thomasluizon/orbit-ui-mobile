'use client'

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { Achievement } from '@orbit/shared/types/gamification'
import type { Goal } from '@orbit/shared/types/goal'
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
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useProfile } from '@/hooks/use-profile'
import { useProgressRetrospective } from '@/hooks/use-retrospective'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

function Section({ title, children, compact = false }: Readonly<{ title: string; children: ReactNode; compact?: boolean }>) {
  const headingId = useId()
  return (
    <section className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={compact ? 'text-[14px] font-medium text-[var(--fg-2)]' : 'text-[20px] font-medium text-[var(--fg-1)]'}>{title}</h2>
      {children}
    </section>
  )
}

function WindowFigureGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
}

/** Four tile-shaped placeholders, ONE busy region: the four stand for one wait, not four. */
function WindowFigureLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div role="progressbar" aria-busy="true" aria-label={label}>
      <WindowFigureGrid>
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" grouped />)}
      </WindowFigureGrid>
    </div>
  )
}

function WindowFrame({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  const headingId = useId()
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-[20px] font-medium text-[var(--fg-1)]">{title}</h2>
      {children}
    </section>
  )
}

function LockedCard({ title, body, action }: Readonly<{ title: string; body: string; action: string }>) {
  const router = useRouter()
  return (
    <div data-testid="progress-locked-card" className="flex flex-col items-start gap-3 rounded-[20px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
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
    <div className="flex flex-col gap-8" role="progressbar" aria-label={label} aria-busy="true">
      <div className="flex w-full max-w-[560px] flex-col gap-3" aria-hidden="true">
        {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} variant="settings" label={label} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" label={label} />)}
      </div>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} variant="habit-row" label={label} />)}
      </div>
    </div>
  )
}

function FrozenTodayStatus({ isFrozenToday }: Readonly<{ isFrozenToday: boolean }>) {
  const t = useTranslations()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) setMounted(true) })
    return () => { active = false }
  }, [])
  const showMessage = mounted && isFrozenToday
  return (
    <div role="status" className={showMessage ? 'flex items-center gap-3 rounded-[12px] bg-[var(--bg-well)] p-3 text-[14px] text-[var(--fg-2)]' : 'sr-only'}>
      {showMessage ? <><Snowflake size={20} strokeWidth={2} color="var(--status-frozen)" aria-hidden="true" /><p>{t('progressScreen.streak.frozenToday')}</p></> : null}
    </div>
  )
}

function StreakSection({ accountProfile, canView, gamificationProfile }: Readonly<{
  accountProfile: ReturnType<typeof useProfile>['profile']
  canView: boolean
  gamificationProfile: ReturnType<typeof useGamificationProfile>['profile']
}>) {
  const headingId = useId()
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const timeZone = accountProfile?.timeZone ?? null
  const freeze = useStreakFreeze(accountProfile, timeZone, canView)
  const repair = useRepairStreak(timeZone)
  const currentStreak = freeze.streakInfo?.currentStreak ?? gamificationProfile?.currentStreak ?? accountProfile?.currentStreak ?? 0
  const longestStreak = freeze.streakInfo?.longestStreak ?? gamificationProfile?.longestStreak ?? accountProfile?.longestStreak ?? 0
  const days = buildStreakWeekDays(freeze.streakInfo, currentStreak, freeze.isFrozenToday, new Date(), 14, timeZone ?? undefined)
  const labels = useMemo(() => days.map((day) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date)), [days, locale])
  const tier = t(getStreakTierLabelKey(currentStreak))
  const repairDate = getAvailableStreakRepairDate(
    freeze.streakInfo?.isRepairAvailable,
    freeze.streakInfo?.repairDate,
  )
  const available = freeze.freezesAvailable
  const canRepair = available > 0
  const dayWords = {
    active: t('progressScreen.streak.active'),
    frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'),
    today: t('progressScreen.streak.today'),
  }

  if (canView && freeze.streakQuery.isError) {
    return (
      <section aria-labelledby={headingId} className="flex w-full max-w-[560px] flex-col gap-3"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
        <ErrorState
          message={t('progressScreen.error')}
          action={<PillButton variant="ghost" onClick={() => void freeze.streakQuery.refetch()}>{t('progressScreen.retry')}</PillButton>}
        />
      </section>
    )
  }

  if (canView && !freeze.streakInfo) {
    return (
      <section aria-labelledby={headingId} className="flex w-full max-w-[560px] flex-col gap-3"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
        <Skeleton variant="habit-row" label={t('progressScreen.loading')} />
      </section>
    )
  }

  return (
    <section aria-labelledby={headingId} className="flex w-full max-w-[560px] flex-col gap-3"><h2 id={headingId} className="sr-only">{t('progressScreen.sections.streak')}</h2>
      <div className="flex items-baseline gap-3">
        <p className="font-[var(--font-display)] text-[60px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--fg-1)]">{new Intl.NumberFormat(locale).format(currentStreak)}</p>
        <p className="text-[17px] text-[var(--fg-2)]">{t('progressScreen.streak.currentLabel', { count: currentStreak })}</p>
      </div>
      <FrozenTodayStatus isFrozenToday={freeze.isFrozenToday} />
      <div className="min-w-0 w-full py-1">
        <DayStrip size={isDesktop ? 24 : 20} scope="account" days={days.map((day) => day.status)} labels={labels} label={t('progressScreen.streak.stripWindow', { count: days.length })} words={dayWords} />
      </div>
      {canView && freeze.streakInfo ? (
        <FreezeBank
          banked={freeze.streakFreezesAccumulated}
          ceiling={freeze.maxStreakFreezesAccumulated}
          usedThisMonth={freeze.freezesUsedThisMonth}
          longestValue={longestStreak} longestLabel={t('progressScreen.streak.longest')}
          daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)}
          earnRateDays={7}
          tierValue={tier}
          tierLabel={t('streakDisplay.detail.tierTileLabel')}
          protectedDays={buildProtectedDayLabels(freeze.streakInfo.recentFreezeDates, locale, freeze.isFrozenToday, timeZone ?? undefined)}
          words={{
            ...dayWords,
            legendLabel: t('progressScreen.streak.legend'),
            bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'),
            nextFreezeProgress: t('progressScreen.streak.nextOf', { current: Math.max(0, 7 - freeze.daysUntilNextFreeze), total: 7 }),
            protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday'),
          }}
        />
      ) : <><div className="grid grid-cols-2 gap-3"><StatTile value={longestStreak} label={t('progressScreen.streak.longest')} /><StatTile value={tier} label={t('streakDisplay.detail.tierTileLabel')} /></div><LockedCard title={t('progressScreen.streak.lockedTitle')} body={t('progressScreen.streak.lockedBody')} action={t('progressScreen.streak.lockedAction')} /></>}
      {repairDate ? (
        <div className="flex flex-col items-start gap-3 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <div className="flex flex-col gap-1">
            <p className="text-[16px] font-medium text-[var(--fg-1)]">{t('progressScreen.streak.repairTitle')}</p>
            <p className="text-[14px] text-[var(--fg-3)]">{canRepair ? t('progressScreen.streak.repairBody', { count: available }) : t('progressScreen.streak.repairEmpty', { count: freeze.daysUntilNextFreeze })}</p>
          </div>
          {canRepair ? <PillButton loading={repair.isPending} onClick={() => repair.mutate()}>{t('progressScreen.streak.repairAction')}</PillButton> : null}
          {repair.isError ? <p role="alert" className="text-[14px] text-[var(--status-bad-text)]">{t('progressScreen.streak.repairError')}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

function GoalIndicator({ goal }: Readonly<{ goal: Goal }>) {
  const t = useTranslations()
  if (goal.status === 'Abandoned') return null
  const label = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={30} label={label} />
  return <ProgressRing value={goal.progressPercentage} size={44} label={label} />
}

function GoalCard({ goal, index, canReorder, onMove, onOpen }: Readonly<{
  goal: Goal
  index: number
  canReorder: boolean
  onMove: (goalId: string, target: number) => void
  onOpen: () => void
}>) {
  const t = useTranslations()
  const { setNodeRef, listeners, transform, isDragging } = useSortable({ id: goal.id, disabled: !canReorder })
  const labelKey = getProgressGoalLabelKey(goal)
  const abandoned = goal.status === 'Abandoned'
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    onMove(goal.id, index + (event.key === 'ArrowUp' ? -1 : 1))
  }
  return (
    <button type="button" aria-label={goal.title} data-goal-id={goal.id} data-dragging={isDragging}
      ref={setNodeRef} {...listeners}
      style={{ transform: CSS.Transform.toString(transform) }}
      aria-roledescription={canReorder ? t('goals.dragItem') : undefined}
      aria-keyshortcuts={canReorder ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onKeyDown={canReorder ? handleKeyDown : undefined}
      onClick={onOpen}
      className="flex w-full cursor-pointer select-none items-center gap-3 rounded-[20px] bg-[var(--bg-card)] p-4 text-left shadow-[inset_0_0_0_1px_var(--hairline-ghost)] hover:bg-[var(--bg-hover)] data-[dragging=true]:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`text-[17px] font-medium ${abandoned ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}>{goal.title}</span>
        <span className="flex flex-wrap items-center gap-2">
          {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
          {!abandoned ? <span className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</span> : null}
        </span>
      </span>
      <GoalIndicator goal={goal} />
    </button>
  )
}

function GoalsSection({ goals, onOpenGoal }: Readonly<{ goals: readonly Goal[]; onOpenGoal: (goalId: string) => void }>) {
  const headingId = useId()
  const t = useTranslations()
  const router = useRouter()
  const reorder = useReorderGoals()
  const [filter, setFilter] = useState<ProgressGoalFilter>('all')
  const drag = useGoalDrag(goals, filter === 'all' && !reorder.isPending, reorder.mutate)
  const filtered = filterProgressGoals(goals, filter)
  const move = (goalId: string, target: number) => {
    const positions = buildGoalMovePositions(goals, goalId, target)
    if (positions) reorder.mutate(positions)
  }
  const options = [
    { value: 'all', label: t('progressScreen.goals.all') }, { value: 'active', label: t('progressScreen.goals.active') },
    { value: 'completed', label: t('progressScreen.goals.completed') }, { value: 'abandoned', label: t('progressScreen.goals.abandoned') },
  ] as const
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3"><h2 id={headingId} className="text-[20px] font-medium text-[var(--fg-1)]">{t('progressScreen.sections.goals')}</h2>
      {goals.length > 0 ? <SegmentedControl options={options} value={filter} onChange={(id) => setFilter(id)} label={t('progressScreen.goals.views')} /> : null}
      {goals.length === 0 ? <EmptyState title={t('progressScreen.goals.empty')} action={<PillButton variant="ghost" onClick={() => router.push('/')}>{t('progressScreen.startHabit')}</PillButton>} /> : null}
      {goals.length > 0 && filtered.length === 0 ? <div className="flex flex-col items-start gap-3 py-6"><p className="text-[14px] text-[var(--fg-3)]">{t('progressScreen.goals.filterEmpty')}</p><PillButton variant="ghost" size="sm" onClick={() => setFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></div> : null}
      {filtered.length > 0 ? (
        <DndContext sensors={drag.sensors} onDragEnd={drag.onDragEnd} collisionDetection={closestCenter}><SortableContext items={filtered.map((goal) => goal.id)} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-3">
          {filtered.map((goal) => {
            const index = goals.findIndex((item) => item.id === goal.id)
            return <GoalCard key={goal.id} goal={goal} index={index} canReorder={filter === 'all' && !reorder.isPending} onMove={move} onOpen={() => onOpenGoal(goal.id)} />
          })}
        </div></SortableContext></DndContext>
      ) : null}
      {reorder.isError ? <p role="alert" className="text-[14px] text-[var(--fg-2)]">{t('progressScreen.goals.reorderError')}</p> : null}
    </section>
  )
}

function WindowSection({ hasProAccess }: Readonly<{ hasProAccess: boolean }>) {
  const t = useTranslations()
  const retrospective = useProgressRetrospective(hasProAccess)
  if (!hasProAccess) return <WindowFrame title={t('progressScreen.sections.window')}><div className="max-w-[560px]"><LockedCard title={t('progressScreen.window.lockedTitle')} body={t('progressScreen.window.lockedBody')} action={t('progressScreen.window.lockedAction')} /></div></WindowFrame>
  if (retrospective.isLoading) return <WindowFrame title={t('progressScreen.sections.window')}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const hasNoHabits = retrospective.isError && extractBackendErrorCode(retrospective.error) === NO_HABITS_FOR_PERIOD
  if (retrospective.isError && !hasNoHabits) {
    return (
      <WindowFrame title={t('progressScreen.sections.window')}>
        <ErrorState
          message={t('progressScreen.error')}
          action={<PillButton variant="ghost" onClick={() => void retrospective.refetch()}>{t('progressScreen.retry')}</PillButton>}
        />
      </WindowFrame>
    )
  }
  if (!retrospective.data && !hasNoHabits) return <WindowFrame title={t('progressScreen.sections.window')}><WindowFigureLoading label={t('progressScreen.loading')} /></WindowFrame>
  const metrics = retrospective.data?.metrics
  const bestWeekday = getBestRetrospectiveWeekdayKey(metrics?.weeklyConsistency ?? [])
  const topHabit = metrics?.topHabits[0]
  return (
    <WindowFrame title={t('progressScreen.sections.window')}>
      <WindowFigureGrid>
        <StatTile value={`${Math.round(metrics?.completionRate ?? 0)}%`} label={t('progressScreen.window.completionRate')} />
        <StatTile value={metrics?.activeDays ?? 0} label={t('progressScreen.window.activeDays')} />
        {bestWeekday ? <StatTile value={t(`dates.daysLong.${bestWeekday}`)} label={t('progressScreen.window.bestWeekday')} /> : <StatTile state="empty" emptyLabel={t('progressScreen.window.bestWeekdayEmpty')} label={t('progressScreen.window.bestWeekday')} />}
        {topHabit ? <StatTile value={topHabit.name} label={t('progressScreen.window.topHabit')} /> : <StatTile state="empty" emptyLabel={t('progressScreen.window.topHabitEmpty')} label={t('progressScreen.window.topHabit')} />}
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

function AchievementMark({ achievement, name }: Readonly<{ achievement: Achievement; name: string }>) {
  const t = useTranslations()
  const Glyph = ACHIEVEMENT_GLYPHS[achievementGlyphKey(achievement.iconKey)]
  return (
    <span
      role="img"
      aria-label={t(achievement.isEarned ? 'progressScreen.achievements.earnedState' : 'progressScreen.achievements.unearnedState', { name })}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
      data-state={achievement.isEarned ? 'earned' : 'unearned'}
      style={achievement.isEarned ? { background: 'var(--status-done)' } : { boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)' }}
    >
      <Glyph
        size={20}
        strokeWidth={2}
        color={achievement.isEarned ? 'var(--bg)' : 'var(--fg-3)'}
      />
    </span>
  )
}

function AchievementTile({ achievement }: Readonly<{ achievement: Achievement }>) {
  const t = useTranslations()
  const current = achievement.progressCurrent
  const target = achievement.progressTarget
  const hasProgress = current != null && target != null
  const name = t(`gamification.achievements.${achievement.id}.name`)
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]" data-achievement-id={achievement.id}>
      <div className="flex items-center gap-3">
        <AchievementMark achievement={achievement} name={name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={`text-[14px] font-medium leading-[19px] ${achievement.isEarned ? 'text-[var(--fg-1)]' : 'text-[var(--fg-2)]'}`}>{name}</p>
          <p className="text-pretty text-[12px] leading-[17px] text-[var(--fg-3)]">{t(`gamification.achievements.${achievement.id}.description`)}</p>
        </div>
        {achievement.isEarned ? <Badge>{t('progressScreen.achievements.earnedLabel')}</Badge> : null}
      </div>
      {hasProgress ? (
        <div className="flex flex-col gap-1">
          <ProgressBar value={current} max={target} label={t('progressScreen.achievements.progressLabel', { name, current, target })} />
          <p className="font-[var(--font-mono)] text-[12px] leading-[17px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.achievements.progress', { current, target })}</p>
        </div>
      ) : null}
    </div>
  )
}

function AchievementsSection({ profile, xpProgress }: Readonly<{ profile: ReturnType<typeof useGamificationProfile>['profile']; xpProgress: number }>) {
  const t = useTranslations()
  if (!profile) return null
  const achievements = visibleProgressAchievements(profile.achievements)
  const categories = Array.from(new Set(achievements.map((achievement) => achievement.category)))
  const levelTitle = t(getGamificationLevelTitleKey(profile.level))
  return (
    <>
      <div className="flex w-full max-w-[560px] flex-col gap-3" data-testid="progress-xp-summary">
        <div className="flex items-baseline gap-3">
          <p className="min-w-0 flex-1 text-[17px] font-medium leading-[22px] text-[var(--fg-1)]">{t('progressScreen.achievements.level', { level: profile.level, title: levelTitle })}</p>
          <p className="font-[var(--font-mono)] text-[12px] leading-[17px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })}</p>
        </div>
        <ProgressBar value={xpProgress} max={100} label={t('progressScreen.achievements.xpProgress')} />
      </div>
      <Section compact title={t('progressScreen.sections.achievements')}>
        {achievements.length === 0 ? <EmptyState title={t('progressScreen.achievements.empty')} /> : categories.map((category) => <div key={category} className="flex flex-col gap-3"><h3 className="pt-1 text-[14px] font-medium leading-5 text-[var(--fg-2)]">{t(`gamification.categories.${category}`)}</h3><div className="grid grid-cols-1 gap-3 md:grid-cols-2">{achievements.filter((achievement) => achievement.category === category).map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} />)}</div></div>)}
      </Section>
    </>
  )
}

export function ProgressContent() {
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const t = useTranslations()
  const router = useRouter()
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
    <main className="flex w-full flex-col gap-8 px-4 py-4 md:px-0">
      {detailGoalId ? <GoalDetailDrawer key={detailGoalId} inline open onOpenChange={(open) => { if (!open) setDetailGoalId(null) }} goalId={detailGoalId} /> : null}
      <div hidden={detailGoalId !== null} className="flex flex-col gap-8">
      <h1 className="sr-only" tabIndex={-1}>{t('progressScreen.title')}</h1>
      {loading ? <ProgressLoading label={t('progressScreen.loading')} /> : null}
      {error ? <div className="w-full max-w-[620px]"><ErrorState message={t('progressScreen.error')} action={<PillButton variant="ghost" size="sm" onClick={retry}>{t('progressScreen.retry')}</PillButton>} /></div> : null}
      {empty ? <div className="pt-12"><EmptyState title={t('progressScreen.empty')} action={<PillButton variant="ghost" size="sm" onClick={() => router.push('/')}>{t('progressScreen.emptyAction')}</PillButton>} /></div> : null}
      {!loading && !error && !empty ? <><StreakSection accountProfile={account.profile} canView={canView} gamificationProfile={gamification.profile} /><GoalsSection onOpenGoal={setDetailGoalId} goals={allGoals} /><WindowSection hasProAccess={account.profile?.hasProAccess ?? false} /><AchievementsSection profile={gamification.profile} xpProgress={gamification.xpProgress} /></> : null}
      </div>
    </main>
  )
}
