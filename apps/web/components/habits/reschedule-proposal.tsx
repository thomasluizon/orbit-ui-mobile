import { Proposed } from '@/components/ui/proposed'

export interface RescheduleProposalProps {
  proposedLabel: string
  dateLabel: string
  timeLabel: string | null
  scheduleLabel: string | null
  rationale: string
  disclosure: string
}

/** The Astra reschedule proposal inside the Hoje reschedule sheet. */
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
        <div className="flex flex-col gap-1 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
          <div data-testid="reschedule-proposed-schedule" className="font-[var(--font-display)] text-[20px] font-medium tabular-nums text-[var(--fg-1)]">
            {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
          </div>
          {scheduleLabel ? <div className="text-sm text-[var(--fg-2)]">{scheduleLabel}</div> : null}
        </div>
      </Proposed>
      <p className="text-sm leading-[1.55] text-[var(--fg-2)]">{rationale}</p>
      <p className="text-xs leading-5 text-[var(--fg-3)]">{disclosure}</p>
    </div>
  )
}
