'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { GamificationCard } from '@orbit/shared/types/chat'
import { gamificationStreakPresentation } from '@orbit/shared/chat/gamification-card-core'
import { DayStrip } from '@/components/dates/day-strip'
import { FreezeBank } from '@/components/ui/freeze-bank'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { StreakFigure } from './streak-figure'

export function GamificationStreak({ streak, read, showHeading }: Readonly<{ streak: NonNullable<GamificationCard['state']['streak']>; read: GamificationCard['read']; showHeading: boolean }>) {
  const t = useTranslations()
  const locale = useLocale()
  const isDesktop = useIsDesktop()
  const presentation = gamificationStreakPresentation(streak, read, locale, t)
  return <div className="flex min-w-0 flex-col gap-4">
    {showHeading ? <h3 className="text-base font-medium text-[var(--fg-1)]">{t('progressScreen.sections.streak')}</h3> : null}
    <StreakFigure currentStreak={streak.currentStreak} />
    <div className="relative min-w-0 w-full py-1"><DayStrip size={isDesktop ? 24 : 20} scope="account" days={presentation.days.map(day => day.status)} labels={presentation.labels} words={presentation.dayWords} label={presentation.stripLabel} /></div>
    <FreezeBank {...presentation.freeze} />
  </div>
}
