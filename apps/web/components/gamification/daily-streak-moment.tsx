'use client'

import { useLocale, useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'

export function DailyStreakMoment({ streak, entering }: { streak: number; entering: boolean }) {
  const t = useTranslations()
  const locale = useLocale()
  const format = new Intl.NumberFormat(locale)
  return (
    <div className="celebration-copy min-w-0 flex-1" aria-hidden="true">
      <p className="text-sm leading-[1.55] text-[var(--fg-2)]">{t('celebration.streak.eyebrow')}</p>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <div className="daily-streak-clip grid overflow-hidden font-display text-[1.75rem] font-medium leading-[1.2] tabular-nums text-[var(--fg-1)]">
          <span data-previous-streak={entering ? '' : undefined} className="daily-streak-previous">{format.format(streak - 1)}</span>
          <span data-current-streak="" className="daily-streak-number">{format.format(streak)}</span>
        </div>
        <span className="text-sm leading-[1.55] text-[var(--fg-2)]">{plural(t('celebration.streak.unit'), streak)}</span>
      </div>
    </div>
  )
}
