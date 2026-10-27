'use client'

import { useLocale, useTranslations } from 'next-intl'

export function StreakFigure({ currentStreak }: Readonly<{ currentStreak: number }>) {
  const locale = useLocale()
  const t = useTranslations()
  return (
    <div data-testid="progress-streak-figure" className="flex items-baseline gap-3">
      <p className="font-display text-[60px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--fg-1)]">{new Intl.NumberFormat(locale).format(currentStreak)}</p>
      <p className="text-[17px] text-[var(--fg-2)]">{t('progressScreen.streak.currentLabel', { count: currentStreak })}</p>
    </div>
  )
}
