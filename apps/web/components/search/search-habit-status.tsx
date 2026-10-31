import type { SearchHabitStatus } from '@orbit/shared/utils'
import { HabitCheck } from '@/components/habits/habit-check'

export function SearchHabitStatusLine({ status }: Readonly<{ status: SearchHabitStatus | null }>) {
  if (!status) return null
  return <span className="flex items-center gap-2 font-mono text-[length:var(--fs-xs)] text-[var(--fg-2)]">
    {status.kind === 'done' ? <span aria-hidden="true" className="flex"><HabitCheck status="done" /></span> : null}
    <span>{status.label}</span>
  </span>
}
