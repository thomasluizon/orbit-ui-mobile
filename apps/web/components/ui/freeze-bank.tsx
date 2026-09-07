import type { FreezeBankProps } from '@orbit/shared/contracts/display'
import { Snowflake } from '@/components/ui/icons'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatTile } from '@/components/ui/stat-tile'

function LegendMark({ state }: Readonly<{ state: 'active' | 'frozen' | 'missed' }>) {
  if (state === 'frozen') return <Snowflake size={16} strokeWidth={2} color="var(--status-frozen)" aria-hidden="true" />
  return <span aria-hidden="true" className="size-3 rounded-[8px]" style={state === 'active' ? { background: 'var(--fg-1)' } : { boxShadow: 'inset 0 0 0 1px var(--fg-4)' }} />
}

export function FreezeBank(props: Readonly<FreezeBankProps>) {
  const atCeiling = props.banked >= props.ceiling
  const protectedEmpty = props.protectedDays.length === 0

  return (
    <div data-component="freeze-bank" data-bank-state={atCeiling ? 'at-ceiling' : 'banked'} data-progress-state={atCeiling ? 'resting' : 'earning'} data-protected-state={protectedEmpty ? 'empty' : 'protected'} className="flex flex-col gap-3">
      <div role="group" aria-label={props.words.legendLabel} className="flex flex-wrap gap-4">
        {(['active', 'frozen', 'missed'] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-2 text-[12px] text-[var(--fg-3)]"><LegendMark state={state} />{props.words[state]}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile value={props.longestValue} label={props.longestLabel} />
        <StatTile value={props.tierValue} label={props.tierLabel} />
      </div>
      <div className="flex flex-col gap-3 rounded-[20px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-[var(--font-display)] text-[22px] font-medium tabular-nums text-[var(--fg-1)]">{props.banked} <span className="text-[14px] text-[var(--fg-3)]">/ {props.ceiling}</span></p>
            <p className="text-[12px] text-[var(--fg-3)]">{props.words.bankedLabel}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-[var(--font-display)] text-[22px] font-medium tabular-nums text-[var(--fg-1)]">{props.usedThisMonth}</p>
            <p className="text-[12px] text-[var(--fg-3)]">{props.words.usedLabel}</p>
          </div>
        </div>
        {!atCeiling ? (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="min-w-0 flex-1 text-[14px] text-[var(--fg-2)]">{props.words.nextLabel}</p>
              <p className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-3)]">{props.words.nextFreezeProgress}</p>
            </div>
            <ProgressBar value={props.daysTowardNext} max={props.earnRateDays} label={props.words.nextProgressLabel} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-medium text-[var(--fg-2)]">{props.words.protectedLabel}</p>
        {protectedEmpty ? <p className="text-[14px] text-[var(--fg-3)]">{props.words.protectedEmpty}</p> : props.protectedDays.map((day) => (
          <div key={day.id} className="flex min-h-7 items-center gap-2">
            <Snowflake size={16} strokeWidth={2} color="var(--status-frozen)" aria-hidden="true" />
            <span className="min-w-0 flex-1 font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-2)]">{day.dateLabel}</span>
            <span className="text-[12px] text-[var(--fg-3)]">{day.isToday ? props.words.protectedToday : props.words.protectedDay}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
