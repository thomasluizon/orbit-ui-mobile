'use client'

import { useMemo, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { Flame, ListChecks, Sparkles, Trophy, type LucideProps } from 'lucide-react'
import { computeDayProgress, formatAPIDate } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { EMPTY_HABITS_BY_ID, useHabits } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { ProgressOrbit } from './progress-orbit'

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
        style={{ width: 36, height: 36, background: 'rgba(var(--primary-rgb), 0.12)' }}
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={1.9} color="var(--primary)" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 5 }}>
        <span
          className="truncate"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
        >
          {label}
        </span>
        {meter !== undefined && (
          <span
            className="block overflow-hidden rounded-full"
            style={{ height: 4, background: 'var(--hairline-strong)' }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${meter}%`,
                background: 'var(--primary)',
                transition: 'width var(--dur-slow) var(--ease-out)',
              }}
            />
          </span>
        )}
      </span>
      <span className="t-num shrink-0" style={{ fontSize: 15 }}>
        {value}
      </span>
    </div>
  )
}

/** Today's contextual rail content: the day's completion orbit over a calm stat stack. */
export function TodayRail() {
  const t = useTranslations()
  const today = useMemo(() => formatAPIDate(new Date()), [])
  const filters = useMemo(
    () => ({ dateFrom: today, dateTo: today, includeOverdue: true }),
    [today],
  )
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const progress = useMemo(() => computeDayProgress(habitsById, today), [habitsById, today])
  const remaining = Math.max(progress.total - progress.done, 0)

  const { profile } = useProfile()
  const canViewGamification = profile?.canViewGamification ?? false
  const { profile: gamification, xpProgress } = useGamificationProfile(canViewGamification)
  const showGamification = canViewGamification && !!gamification

  return (
    <div className="flex flex-col" style={{ gap: 20, paddingBlock: 8 }}>
      <div className="flex flex-col items-center" style={{ gap: 16 }}>
        <ProgressOrbit
          done={progress.done}
          total={progress.total}
          label={t('rail.todayProgress')}
          completeLabel={t('rail.allDone')}
          ariaLabel={t('rail.progressLabel', { done: progress.done, total: progress.total })}
        />
      </div>

      {habitsQuery.isSuccess && (
        <div
          className="flex flex-col"
          style={{
            gap: 8,
            paddingTop: 16,
            boxShadow: 'inset 0 1px 0 var(--hairline)',
          }}
        >
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
                value={`${gamification.currentStreak} ${plural(
                  t('streakDisplay.daysSuffix'),
                  gamification.currentStreak,
                )}`}
              />
              <RailStatRow
                icon={Sparkles}
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
    </div>
  )
}
