'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { animate, m, useMotionValue, useReducedMotion } from 'motion/react'
import { motionEasings, motionDurations } from '@orbit/shared/theme'
import { useTodayPage } from './use-today-page'
import {
  TodayHeaderRegion,
  TodayHabitsPanel,
  TodayOverlays,
} from './today-page-view'
import { TodayAstra } from '@/components/today/today-astra'
import type { TodayInitialHabits } from './today-initial-data'
import { useProfile } from '@/hooks/use-profile'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'

interface TodayPageClientProps {
  initialToday: string
  initialHabits: TodayInitialHabits | null
}

function TodayDayTransition({
  date,
  children,
}: Readonly<{ date: string; children: React.ReactNode }>) {
  const prefersReducedMotion = useReducedMotion()
  const opacity = useMotionValue(1)
  const translateY = useMotionValue(0)
  const previousDateRef = useRef(date)

  useEffect(() => {
    const previousDate = previousDateRef.current
    if (prefersReducedMotion) {
      previousDateRef.current = date
      opacity.set(1)
      translateY.set(0)
      return
    }

    if (previousDate === date) return
    previousDateRef.current = date

    const isInFlight = Math.abs(translateY.get()) > 0.01 || opacity.get() < 0.999
    if (!isInFlight) {
      translateY.set(date > previousDate ? 8 : -8)
      opacity.set(0.9)
    }

    const transition = {
      duration: motionDurations.base / 1000,
      ease: motionEasings.enter,
    } as const
    const translateAnimation = animate(translateY, 0, transition)
    const opacityAnimation = animate(opacity, 1, transition)

    return () => {
      translateAnimation.stop()
      opacityAnimation.stop()
    }
  }, [date, opacity, prefersReducedMotion, translateY])

  return (
    <m.div
      data-today-day-transition=""
      style={{ opacity, y: translateY }}
    >
      {children}
    </m.div>
  )
}

export function TodayPageClient({
  initialToday,
  initialHabits,
}: Readonly<TodayPageClientProps>) {
  const t = useTranslations()
  const { profile, isError, refetch } = useProfile()
  if (!profile) {
    return isError
      ? <ErrorState message={t('common.error')} action={<PillButton variant="secondary" onClick={() => void refetch()}>{t('common.retry')}</PillButton>} />
      : <div role="status" aria-busy="true" aria-label={t('profile.loading')} className="mx-auto flex w-full max-w-[740px] flex-col gap-4 p-4">
          <Skeleton variant="settings" grouped />
          <Skeleton variant="habit-row" grouped />
          <Skeleton variant="habit-row" grouped />
          <Skeleton variant="habit-row" grouped />
        </div>
  }
  return <TodayPageContent initialToday={initialToday} initialHabits={initialHabits} />
}

function TodayPageContent({ initialToday, initialHabits }: Readonly<TodayPageClientProps>) {
  const view = useTodayPage(initialToday, initialHabits)

  return (
    <div className="relative">
      <TodayDayTransition date={view.nav.dateStr}>
        <TodayAstra
          isTodaySelected={view.nav.dateStr === view.nav.today}
          suppressed={view.isSelectMode || view.showCreateModal || view.listSurfaceOpen || view.data.isFetching || view.data.showLoadError}
        />

        <TodayHeaderRegion view={view} />

        <TodayHabitsPanel view={view} />
      </TodayDayTransition>

      <TodayOverlays view={view} />
    </div>
  )
}
