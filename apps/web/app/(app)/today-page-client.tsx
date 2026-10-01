'use client'

import { useEffect, useRef, useState } from 'react'
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
import type { Profile } from '@orbit/shared/types/profile'
import { PreloadedProfileContext, useProfile } from '@/hooks/use-profile'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'

interface TodayPageClientProps {
  initialToday: string
  initialHabits: TodayInitialHabits | null
  initialProfile?: Profile | null
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
  initialProfile,
}: Readonly<TodayPageClientProps>) {
  const t = useTranslations()
  const accountGeneration = useAccountGeneration()
  const [seedAccountGeneration] = useState(accountGeneration)
  const preloadedProfile = accountGeneration === seedAccountGeneration ? initialProfile ?? undefined : undefined
  const { profile, isError, refetch } = useProfile({
    initialData: preloadedProfile,
  })
  if (!profile) {
    return isError
      ? <><h1 className="sr-only" tabIndex={-1}>{t('nav.today')}</h1><ErrorState message={t('common.error')} action={<PillButton variant="secondary" onClick={() => void refetch()}>{t('common.retry')}</PillButton>} /></>
      : <div role="status" aria-busy="true" aria-label={t('profile.loading')} className="mx-auto flex w-full max-w-[740px] flex-col gap-4 p-4">
          <h1 className="sr-only" tabIndex={-1}>{t('nav.today')}</h1>
          <Skeleton variant="settings" grouped />
          <Skeleton variant="habit-row" grouped />
          <Skeleton variant="habit-row" grouped />
          <Skeleton variant="habit-row" grouped />
        </div>
  }
  return <TodayPageContent initialToday={initialToday} initialHabits={initialHabits} preloadedProfile={preloadedProfile} />
}

function TodayPageContent({ initialToday, initialHabits, preloadedProfile }: Readonly<{
  initialToday: string
  initialHabits: TodayInitialHabits | null
  preloadedProfile?: Profile
}>) {
  const view = useTodayPage(initialToday, initialHabits)

  return (
    <div className="relative mx-auto w-full max-w-[740px]">
      <TodayDayTransition date={view.nav.dateStr}>
        <TodayAstra
          isTodaySelected={view.nav.dateStr === view.nav.today}
          suppressed={view.isSelectMode || view.showCreateModal || view.listSurfaceOpen || view.data.isFetching || view.data.showLoadError}
        />

        <PreloadedProfileContext.Provider value={preloadedProfile}>
          <TodayHeaderRegion view={view} />
        </PreloadedProfileContext.Provider>

        <TodayHabitsPanel view={view} />
      </TodayDayTransition>

      <TodayOverlays view={view} />
    </div>
  )
}
