import { CalendarClock } from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'

export interface RescheduleProposalProps {
  proposedLabel: string
  dateLabel: string
  timeLabel: string | null
  scheduleLabel: string
  rationale: string
  disclosure: string
}

/** Reusable Astra reschedule proposal shared by Hoje and the habit detail surface. */
export function RescheduleProposal({
  proposedLabel,
  dateLabel,
  timeLabel,
  scheduleLabel,
  rationale,
  disclosure,
}: Readonly<RescheduleProposalProps>) {
  return (
    <div className="flex flex-col gap-3">
      <Proposed proposed scope="block" label={proposedLabel}>
        <div className="flex items-center gap-3 p-4">
          <CalendarClock size={20} strokeWidth={1.9} className="shrink-0 text-[var(--fg-3)]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-[0.04em]">{proposedLabel}</div>
            <div data-testid="reschedule-proposed-schedule" className="mt-1 text-base font-medium text-[var(--fg-1)]">
              {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
            </div>
            <div className="mt-1 text-sm">{scheduleLabel}</div>
          </div>
        </div>
      </Proposed>
      <p className="text-sm leading-6 text-[var(--fg-1)]">{rationale}</p>
      <p className="text-xs leading-5 text-[var(--fg-3)]">{disclosure}</p>
    </div>
  )
}
