'use client'

import { useEffect, useState } from 'react'
import type { Ref } from 'react'
import { useTranslations } from 'next-intl'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { Button } from '@/components/ui/pill-button'
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
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const label = plural(t('streakDisplay.badge.tooltip', { count: streak }), streak)
  useEffect(() => {
    const timeout = setTimeout(() => setAnnouncement(label), 0)
    return () => clearTimeout(timeout)
  }, [label])
  useEffect(() => {
    if (focused || hovered) return
    const timeout = setTimeout(() => useUIStore.getState().completeActiveCelebration(id), DAILY_STREAK_MOMENT_DURATION)
    return () => clearTimeout(timeout)
  }, [id, focused, hovered])

  return (
    <section
      aria-label={label}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
      data-daily-streak-moment=""
      data-motion={reducedMotion ? 'static' : 'animated'}
      className="flex items-center gap-[12px] rounded-[20px] bg-[var(--bg-elev)] border border-transparent p-4 shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline)]"
    >
      <span role="status" className="sr-only">{announcement}</span>
      <svg aria-hidden="true" className="size-[44px] shrink-0" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--status-empty)" strokeWidth="2" />
        <circle className={reducedMotion ? undefined : 'daily-streak-ring'} cx="22" cy="22" r="18" fill="none" pathLength="100" stroke="var(--fg-1)" strokeDasharray="100" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 22 22)" />
      </svg>
      <div className="min-w-0 flex-1" aria-hidden="true">
        <p className="text-sm leading-[1.55] text-[var(--fg-2)]">{t('celebration.streak.eyebrow')}</p>
        <div className="relative overflow-hidden font-display text-[1.75rem] font-medium leading-[1.2] tabular-nums text-[var(--fg-1)]">
          {reducedMotion ? null : <span data-previous-streak="" className="daily-streak-previous absolute inset-0">{streak - 1}</span>}
          <span className={reducedMotion ? undefined : 'daily-streak-number block'}>{streak}</span>
        </div>
      </div>
      <Button buttonRef={closeRef} variant="ghost" quiet iconOnly minimumHeight={TOUCH_TARGET_MIN} label={t('celebration.close')} onClick={onDismiss}>
        <X aria-hidden="true" size={20} />
      </Button>
    </section>
  )
}
