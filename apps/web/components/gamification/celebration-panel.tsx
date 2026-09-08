'use client'

import { useTranslations } from 'next-intl'
import { useReducedMotion } from 'motion/react'
import { X } from '@/components/ui/icons'
import { plural } from '@/lib/plural'
import { useUIStore } from '@/stores/ui-store'

const STREAK_MILESTONES = new Set([7, 14, 30, 90, 100, 365])

function getCelebrationCopy(
  active: NonNullable<ReturnType<typeof useUIStore.getState>['activeCelebration']>,
): {
  eyebrowKey: string
  lineKey: string
  values: Record<string, string | number>
  pluralCount?: number
} {
  switch (active.kind) {
    case 'streak':
      return {
        eyebrowKey: 'streak.eyebrow',
        lineKey: 'streak.line',
        values: { count: active.payload.streak },
      }
    case 'goal-completed': {
      const unit = active.payload.unit.trim()
      return {
        eyebrowKey: 'goal.eyebrow',
        lineKey: unit ? 'goal.line' : 'goal.lineWithoutUnit',
        values: unit
          ? { name: active.payload.name, count: active.payload.count, unit }
          : { name: active.payload.name, count: active.payload.count },
      }
    }
    case 'level-up':
      return {
        eyebrowKey: 'level.eyebrow',
        lineKey: 'level.line',
        values: { level: active.payload.level },
      }
    case 'all-done':
      return {
        eyebrowKey: 'day.eyebrow',
        lineKey: 'day.line',
        values: { count: active.payload.count },
        pluralCount: active.payload.count,
      }
  }
}

export function CelebrationPanel() {
  const t = useTranslations('celebration')
  const reducedMotion = Boolean(useReducedMotion())
  const active = useUIStore((state) => state.activeCelebration)
  const complete = useUIStore((state) => state.completeActiveCelebration)

  if (!active) return null
  if (active.kind === 'streak' && !STREAK_MILESTONES.has(active.payload.streak)) return null

  const { eyebrowKey, lineKey, values, pluralCount } = getCelebrationCopy(active)
  const translatedLine = t(lineKey, values)
  const line = pluralCount === undefined
    ? translatedLine
    : plural(translatedLine, pluralCount)

  function dismiss() {
    complete(active?.id)
  }

  return (
    <section
      key={active.id}
      aria-atomic="true"
      aria-live="polite"
      data-celebration-panel=""
      className="mx-4 flex items-center gap-4 rounded-[20px] bg-[var(--bg-elev)] p-6 shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline)]"
      style={reducedMotion ? undefined : { animation: 'celebration-rise 280ms var(--ease-out) both' }}
    >
      <svg aria-hidden="true" className="size-11 shrink-0" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--status-empty)" strokeWidth="2" />
        <circle
          className={reducedMotion ? undefined : 'celebration-ring'}
          cx="22"
          cy="22"
          r="18"
          fill="none"
          pathLength="100"
          stroke="var(--fg-1)"
          strokeDasharray="100"
          strokeLinecap="round"
          strokeWidth="3"
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-[var(--fg-3)]">{t(eyebrowKey)}</p>
        <p className="text-base leading-[1.45] text-[var(--fg-1)]">{line}</p>
      </div>
      <button type="button" aria-label={t('close')} className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-well)]" onClick={dismiss}>
        <X aria-hidden="true" size={20} />
      </button>
    </section>
  )
}
