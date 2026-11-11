import { useEffect, useRef, useState } from 'react'
import { animate } from 'motion/react'
import { motionSprings, resolveMotionPreset } from '@orbit/shared/theme'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HABIT_CHECK_PATH, HABIT_CHECK_PERIMETER, habitCheckProgress } from '@orbit/shared/utils/habit-row-status'
import { Check } from '@/components/ui/icons'
import { useViewportMatch } from '@/hooks/use-viewport-match'

interface HabitCheckProps {
  status: HabitStatus
  label?: string
  unavailable?: boolean
  progress?: { done: number; total: number }
}

function ProgressRing({ ratio, bad }: Readonly<{ ratio: number; bad: boolean }>) {
  return <svg aria-hidden="true" width={28} height={28} className="absolute inset-0">
    <path d={HABIT_CHECK_PATH} fill="none" stroke={bad ? 'var(--status-bad)' : 'var(--primary)'}
      strokeWidth={1} strokeDasharray={`${ratio * HABIT_CHECK_PERIMETER} ${HABIT_CHECK_PERIMETER}`} strokeLinecap="round" />
  </svg>
}

function useCompletionSettle(done: boolean): number | null {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const [previousDone, setPreviousDone] = useState(done)
  const [logged, setLogged] = useState(false)
  if (done !== previousDone) {
    setPreviousDone(done)
    setLogged(done)
  }
  return logged && !reduced ? resolveMotionPreset('success-feedback').scaleFrom : null
}

export function HabitCheck({ status, label, unavailable = false, progress }: Readonly<HabitCheckProps>) {
  const ratio = habitCheckProgress(progress)
  const done = status !== 'bad' && (progress ? ratio === 1 : status === 'done')
  const settleFrom = useCompletionSettle(done)
  const checkRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (settleFrom === null || !checkRef.current) return
    const settle = animate(checkRef.current, { scale: [settleFrom, 1] }, { type: 'spring', ...motionSprings.completion })
    return () => settle.stop()
  }, [settleFrom])
  if (unavailable) return (
    <span data-habit-check="" data-focus-ring-owner="" data-status="unavailable"
      role={label ? 'img' : undefined} aria-label={label}
      className="habit-check-motion relative inline-flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: 28, height: 28, background: 'var(--bg-well)', boxShadow: 'none' }} />
  )
  const { graphic: color } = progress ? { graphic: 'var(--track-empty)' } : {
    empty: { graphic: 'var(--status-empty)' }, done: { graphic: 'var(--fg-1)' }, overdue: { graphic: 'var(--status-overdue)' }, bad: { graphic: 'var(--status-bad)' },
  }[status]
  return (
    <span ref={checkRef} data-habit-check="" data-focus-ring-owner="" data-status={status}
      data-habit-check-settle={settleFrom === null ? undefined : ''}
      role={label ? 'img' : undefined} aria-label={label}
      className="habit-check-motion relative inline-flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: 28, height: 28, background: done ? 'var(--fg-1)' : 'var(--habit-check-feedback, transparent)', boxShadow: done ? 'none' : `inset 0 0 0 1px ${color}` }}>
      {done ? <span data-habit-check-feedback="" aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" /> : null}
      {done ? <Check aria-hidden="true" className="relative" size={16} strokeWidth={3} color="var(--bg)" /> : null}
      {!done && ratio > 0 ? <ProgressRing ratio={ratio} bad={status === 'bad'} /> : null}
    </span>
  )
}
