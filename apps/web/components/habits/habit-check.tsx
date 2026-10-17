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
  const ratio = habitCheckProgress(progress)
  const done = !unavailable && status !== 'bad' && (progress ? ratio === 1 : status === 'done')
  const color = progress ? 'var(--track-empty)' : {
    empty: { graphic: 'var(--status-empty)' }, done: { graphic: 'var(--fg-1)' }, overdue: { graphic: 'var(--status-overdue)' }, bad: { graphic: 'var(--status-bad)' },
  }[status].graphic
  return (
    <span data-habit-check="" data-status={unavailable ? 'unavailable' : status}
      role={label ? 'img' : undefined} aria-label={label}
      className="relative inline-flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: 28, height: 28, background: unavailable ? 'var(--bg-well)' : done ? 'var(--fg-1)' : 'transparent', boxShadow: unavailable || done ? 'none' : `inset 0 0 0 1px ${color}` }}>
      {done ? <Check aria-hidden="true" size={16} strokeWidth={3} color="var(--bg)" /> : null}
      {!unavailable && !done && ratio > 0 ? <svg aria-hidden="true" width={28} height={28} className="absolute inset-0">
        <path d={HABIT_CHECK_PATH} fill="none" stroke={status === 'bad' ? 'var(--status-bad)' : 'var(--primary)'}
          strokeWidth={1} strokeDasharray={`${ratio * HABIT_CHECK_PERIMETER} ${HABIT_CHECK_PERIMETER}`} strokeLinecap="round" />
      </svg> : null}
    </span>
  )
}
