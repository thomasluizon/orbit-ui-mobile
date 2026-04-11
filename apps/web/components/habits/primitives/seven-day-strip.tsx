'use client'

import type { SevenDayStripCell } from '@orbit/shared/utils'
import { computeSevenDayStrip } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

interface SevenDayStripProps {
  habit: Pick<NormalizedHabit, 'instances'>
  accentColor: string
  today?: Date
}

/**
 * Seven-day status strip. Newest on the right. Derives status from the
 * habit's own `instances` array via the shared helper.
 */
export function SevenDayStrip({ habit, accentColor, today }: Readonly<SevenDayStripProps>) {
  const cells = computeSevenDayStrip(habit, today)

  return (
    <div className="flex items-center gap-1" role="img" aria-label="Last 7 days">
      {cells.map((cell) => (
        <SevenDayDot key={cell.date} cell={cell} accentColor={accentColor} />
      ))}
    </div>
  )
}

function SevenDayDot({
  cell,
  accentColor,
}: Readonly<{ cell: SevenDayStripCell; accentColor: string }>) {
  const size = 'size-2'
  if (cell.status === 'done') {
    return <span className={`${size} rounded-full`} style={{ background: accentColor }} />
  }
  if (cell.status === 'missed') {
    return (
      <span
        className={`${size} rounded-full border border-red-400/40 bg-red-500/10`}
        aria-label="missed"
      />
    )
  }
  if (cell.status === 'today-pending') {
    return (
      <span
        className={`${size} rounded-full border-2 border-dashed`}
        style={{ borderColor: accentColor }}
        aria-label="today pending"
      />
    )
  }
  if (cell.status === 'future') {
    return <span className={`${size} rounded-full border border-border-muted`} />
  }
  return <span className={`${size} rounded-full border border-border-muted opacity-40`} />
}
