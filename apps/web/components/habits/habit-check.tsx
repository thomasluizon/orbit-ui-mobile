import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HABIT_CHECK_PATH, HABIT_CHECK_PERIMETER, habitCheckProgress } from '@orbit/shared/utils/habit-row-status'
import { Check } from '@/components/ui/icons'

interface HabitCheckProps {
  status: HabitStatus
  label?: string
  unavailable?: boolean
  progress?: { done: number; total: number }
}

export function HabitCheck({ status, label, unavailable = false, progress }: Readonly<HabitCheckProps>) {
  if (unavailable) return (
    <span data-habit-check="" data-focus-ring-owner="" data-status="unavailable"
      role={label ? 'img' : undefined} aria-label={label}
      className="habit-check-motion relative inline-flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: 28, height: 28, background: 'var(--bg-well)', boxShadow: 'none' }} />
  )
  const ratio = habitCheckProgress(progress)
  const done = status !== 'bad' && (progress ? ratio === 1 : status === 'done')
  const color = progress ? 'var(--track-empty)' : {
    empty: { graphic: 'var(--status-empty)' }, done: { graphic: 'var(--fg-1)' }, overdue: { graphic: 'var(--status-overdue)' }, bad: { graphic: 'var(--status-bad)' },
  }[status].graphic
  return (
    <span data-habit-check="" data-focus-ring-owner="" data-status={status}
      role={label ? 'img' : undefined} aria-label={label}
      className="habit-check-motion relative inline-flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: 28, height: 28, background: done ? 'var(--fg-1)' : 'var(--habit-check-feedback, transparent)', boxShadow: done ? 'none' : `inset 0 0 0 1px ${color}` }}>
      {done ? <span data-habit-check-feedback="" aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" /> : null}
      {done ? <Check aria-hidden="true" className="relative" size={16} strokeWidth={3} color="var(--bg)" /> : null}
      {!done && ratio > 0 ? <svg aria-hidden="true" width={28} height={28} className="absolute inset-0">
        <path d={HABIT_CHECK_PATH} fill="none" stroke={status === 'bad' ? 'var(--status-bad)' : 'var(--primary)'}
          strokeWidth={1} strokeDasharray={`${ratio * HABIT_CHECK_PERIMETER} ${HABIT_CHECK_PERIMETER}`} strokeLinecap="round" />
      </svg> : null}
    </span>
  )
}
