'use client'

import { useEffect } from 'react'
import type { Ref } from 'react'
import { useTranslations } from 'next-intl'
import { DAILY_STREAK_MOMENT_DURATION } from '@orbit/shared/stores'
import { X } from '@/components/ui/icons'
import { useUIStore } from '@/stores/ui-store'
import { plural } from '@/lib/plural'

export function DailyStreakMoment({ streak, reducedMotion, onDismiss, closeRef, id }: {
  id: string
  streak: number
  reducedMotion: boolean
  onDismiss: () => void
  closeRef: Ref<HTMLButtonElement>
}) {
  const t = useTranslations()
  useEffect(() => {
    const timeout = setTimeout(() => useUIStore.getState().completeActiveCelebration(id), DAILY_STREAK_MOMENT_DURATION)
    return () => clearTimeout(timeout)
  }, [id])

  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={plural(t('streakDisplay.badge.tooltip', { count: streak }), streak)}
      data-daily-streak-moment=""
      data-motion={reducedMotion ? 'static' : 'animated'}
      className="flex items-center gap-4 rounded-[20px] bg-[var(--bg-elev)] p-4 shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline)]"
    >
      <svg aria-hidden="true" className="size-11 shrink-0" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--status-empty)" strokeWidth="2" />
        <circle className={reducedMotion ? undefined : 'celebration-ring'} cx="22" cy="22" r="18" fill="none" pathLength="100" stroke="var(--fg-1)" strokeDasharray="100" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 22 22)" />
      </svg>
      <div className="min-w-0 flex-1" aria-hidden="true">
        <p className="text-sm text-[var(--fg-2)]">{t('celebration.streak.eyebrow')}</p>
        <div className="relative overflow-hidden font-display text-2xl leading-[1.2] tabular-nums text-[var(--fg-1)]">
          {reducedMotion ? null : <span data-previous-streak="" className="daily-streak-previous absolute inset-0">{streak - 1}</span>}
          <span className={reducedMotion ? undefined : 'daily-streak-number block'}>{streak}</span>
        </div>
      </div>
      <button ref={closeRef} type="button" onClick={onDismiss} aria-label={t('celebration.close')} className="flex size-[var(--touch-min)] shrink-0 items-center justify-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-well)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">
        <X aria-hidden="true" size={20} />
      </button>
    </section>
  )
}
