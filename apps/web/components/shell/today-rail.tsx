'use client'

import { useMemo, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { Flame, ListChecks, Trophy, Zap, type LucideProps } from '@/components/ui/icons'
import { computeDayProgress } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { useToday } from '@/app/(app)/today-provider'
import { EMPTY_HABITS_BY_ID, useHabits } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ProgressOrbit } from './progress-orbit'
import { RailConsistency } from './rail-consistency'
import { RailNextAchievement } from './rail-next-achievement'
import { RailAstraPill } from './rail-astra-pill'

function RailStatRow({
  icon: Icon,
  label,
  value,
  meter,
}: Readonly<{
  icon: ComponentType<LucideProps>
  label: string
  value: string
  /** 0–100 fill for an optional thin progress meter under the label (XP). */
  meter?: number
}>) {
  return (
    <div className="flex items-center" style={{ gap: 12, minHeight: 44 }}>
      <span
        className="flex shrink-0 items-center justify-center rounded-[12px]"
        style={{ width: 36, height: 36, background: 'var(--bg-well)' }}
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={1.9} color="var(--fg-2)" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span
          className="truncate"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
        >
          {label}
        </span>
        {meter !== undefined && <ProgressBar progress={meter / 100} label={label} className="h-1!" />}
      </div>
      <span className="t-num shrink-0" style={{ fontSize: 15 }}>
        {value}
      </span>
    </div>
  )
}

/** Today's contextual rail content: the day's completion orbit over a calm stat stack. */
export function TodayRail() {
  const t = useTranslations()
  const today = useToday()
  const filters = useMemo(
    () => ({ dateFrom: today, dateTo: today, includeOverdue: true }),
    [today],
  )
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  // react-doctor-disable-next-line exhaustive-deps -- habitsById aliases habitsQuery.data.habitsById and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const progress = useMemo(() => computeDayProgress(habitsById, today), [habitsById, today])
  const remaining = Math.max(progress.total - progress.done, 0)

  const { profile } = useProfile()
  const canViewGamification = profile?.canViewGamification ?? false
  const { profile: gamification, xpProgress } = useGamificationProfile(canViewGamification)
  const showGamification = canViewGamification && !!gamification
  const showStats = habitsQuery.isSuccess && progress.total > 0
  const currentStreak = profile?.currentStreak ?? 0

  const renderOrbit = () => {
    if (habitsQuery.isPending) {
      return (
        <div
          aria-hidden="true"
          className="skeleton-pulse rounded-full"
          style={{ width: 200, height: 200, boxShadow: 'inset 0 0 0 4px var(--hairline-strong)' }}
        />
      )
    }
    if (habitsQuery.isError) {
      return (
        <div className="flex flex-col items-center" style={{ gap: 12, paddingBlock: 24 }}>
          <span className="t-meta">{t('rail.loadFailed')}</span>
          <button
            type="button"
            onClick={() => void habitsQuery.refetch()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-[14px] font-medium text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] transition-[transform,background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
          >
            {t('common.retry')}
          </button>
        </div>
      )
    }
    if (progress.total === 0) {
      return (
        <div
          className="relative inline-flex items-center justify-center"
          style={{ width: 200, height: 200 }}
        >
          <svg width={200} height={200} viewBox="0 0 200 200" aria-hidden="true">
            <circle
              cx={100}
              cy={100}
              r={88}
              fill="none"
              stroke="var(--hairline-strong)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="2 14"
            />
          </svg>
          <span
            className="t-secondary absolute text-center"
            style={{ maxWidth: 150, color: 'var(--fg-3)' }}
          >
            {t('rail.empty')}
          </span>
        </div>
      )
    }
    return (
      <ProgressOrbit
        done={progress.done}
        total={progress.total}
        label={t('rail.todayProgress')}
        completeLabel={t('rail.allDone')}
        ariaLabel={t('rail.progressLabel', { done: progress.done, total: progress.total })}
      />
    )
  }

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ gap: 20, paddingBlock: 8, minHeight: '100%', justifyContent: 'space-between' }}
    >
      <div className="flex flex-col items-center" style={{ gap: 16 }}>
        {renderOrbit()}
      </div>

      {showStats && (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <RailStatRow
            icon={ListChecks}
            label={t('rail.remaining')}
            value={String(remaining)}
          />
          {showGamification && (
            <>
              <RailStatRow
                icon={Flame}
                label={t('streakDisplay.title')}
                value={`${currentStreak} ${plural(
                  t('streakDisplay.daysSuffix'),
                  currentStreak,
                )}`}
              />
              <RailStatRow
                icon={Zap}
                label={t('gamification.profileCard.level', { level: gamification.level })}
                value={`${xpProgress}%`}
                meter={xpProgress}
              />
              <RailStatRow
                icon={Trophy}
                label={t('gamification.profileCard.tileLabel')}
                value={String(gamification.achievementsEarned)}
              />
            </>
          )}
        </div>
      )}

      <RailConsistency />

      <RailNextAchievement />

      <RailAstraPill />
    </div>
  )
}
