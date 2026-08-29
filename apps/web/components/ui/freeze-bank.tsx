'use client'

import { useState } from 'react'
import type { FreezeBankProps } from '@orbit/shared/contracts/display'
import { ChevronDown, Snowflake } from '@/components/ui/icons'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatTile } from '@/components/ui/stat-tile'

function LegendMark({ state }: Readonly<{ state: 'active' | 'frozen' | 'missed' | 'today' }>) {
  if (state === 'frozen') {
    return <Snowflake size={16} strokeWidth={2} color="var(--fg-2)" aria-hidden="true" />
  }

  const style =
    state === 'active'
      ? { background: 'var(--fg-1)' }
      : state === 'today'
        ? { boxShadow: 'inset 0 0 0 2px var(--primary)' }
        : { boxShadow: 'inset 0 0 0 1px var(--hairline-strong)' }

  return <span aria-hidden="true" className="size-4 rounded-[8px]" style={style} />
}

export function FreezeBank(props: Readonly<FreezeBankProps>) {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? false)
  const atCeiling = props.banked >= props.ceiling
  const protectedEmpty = props.protectedDays.length === 0

  return (
    <div
      data-component="freeze-bank"
      data-bank-state={atCeiling ? 'at-ceiling' : 'banked'}
      data-progress-state={atCeiling ? 'resting' : 'earning'}
      data-protected-state={protectedEmpty ? 'empty' : 'protected'}
      className="flex flex-col gap-4"
    >
      <div role="group" aria-label={props.words.legendLabel} className="flex flex-wrap gap-4">
        {(['active', 'frozen', 'missed', 'today'] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-2 text-[12px] text-[var(--fg-3)]">
            <LegendMark state={state} />
            {props.words[state]}
          </span>
        ))}
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="freeze-bank-details"
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-11 items-center gap-3 rounded-[12px] bg-[var(--bg-field)] px-4 text-left text-[14px] font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--border-control)] transition-[background-color,color] duration-[var(--dur-fast)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      >
        <span className="min-w-0 flex-1">
          {expanded ? props.words.disclosureExpanded : props.words.disclosureCollapsed}
        </span>
        <ChevronDown
          size={20}
          strokeWidth={2}
          aria-hidden="true"
          className={expanded ? 'rotate-180' : undefined}
        />
      </button>

      {expanded ? (
        <div id="freeze-bank-details" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-[20px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-[var(--font-display)] text-[22px] font-medium tabular-nums text-[var(--fg-1)]">
                  {props.banked} <span className="text-[14px] text-[var(--fg-3)]">/ {props.ceiling}</span>
                </p>
                <p className="text-[12px] text-[var(--fg-3)]">{props.words.bankedLabel}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-[var(--font-display)] text-[22px] font-medium tabular-nums text-[var(--fg-1)]">
                  {props.usedThisMonth}{' '}
                  <span className="text-[14px] text-[var(--fg-3)]">/ {props.monthlyUseCeiling}</span>
                </p>
                <p className="text-[12px] text-[var(--fg-3)]">{props.words.usedLabel}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-3">
                <p className="min-w-0 flex-1 text-[14px] text-[var(--fg-2)]">{props.words.nextLabel}</p>
                <p className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-3)]">
                  {atCeiling ? props.words.capacityMessage : props.words.nextFreezeInDays}
                </p>
              </div>
              <ProgressBar
                value={atCeiling ? 0 : props.daysTowardNext}
                max={props.earnRateDays}
                label={props.words.nextProgressLabel}
              />
            </div>
          </div>

          <StatTile value={props.tierValue} label={props.tierLabel} />

          <div className="flex flex-col gap-1">
            <p className="text-[14px] font-medium text-[var(--fg-2)]">{props.words.protectedLabel}</p>
            {protectedEmpty ? (
              <p className="text-[14px] text-[var(--fg-3)]">{props.words.protectedEmpty}</p>
            ) : (
              props.protectedDays.map((day) => (
                <div key={day.id} className="flex min-h-11 items-center gap-2">
                  <Snowflake size={16} strokeWidth={2} color="var(--fg-2)" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-2)]">
                    {day.dateLabel}
                  </span>
                  <span className="text-[12px] text-[var(--fg-3)]">
                    {day.isToday ? props.words.protectedToday : props.words.protectedDay}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
