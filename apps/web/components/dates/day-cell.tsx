'use client'

import type { CSSProperties } from 'react'
import type { DayCellProps, DayOutcome } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '@orbit/shared/utils'

const NUMERAL_ON_FILL = 'text-[var(--bg)]'
const NUMERAL_ON_FILL_INTERACTIVE = 'text-[var(--bg)] group-hover:text-[var(--fg-1)]'

function ringStyle(outcome: DayOutcome, interactive: boolean): CSSProperties {
  if (outcome === 'full') return { background: interactive ? 'transparent' : 'var(--fg-1)' }
  if (outcome === 'not-scheduled') return { background: 'transparent' }
  if (outcome === 'none') return { boxShadow: 'inset 0 0 0 2px var(--status-empty)' }
  return {}
}

function filledNumeralClass(interactive: boolean) {
  return interactive ? NUMERAL_ON_FILL_INTERACTIVE : NUMERAL_ON_FILL
}

function PartialArc({ fraction, size }: Readonly<{ fraction: number; size: number }>) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const center = size / 2
  const sweep = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <svg aria-hidden="true" width={size} height={size} className="absolute inset-0 -rotate-90">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--status-empty)" strokeWidth={stroke} />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        pathLength={100}
        stroke="var(--primary)"
        strokeDasharray={`${sweep} 100`}
        strokeLinecap="round"
        strokeWidth={stroke}
      />
    </svg>
  )
}

function DayCellContents({ props, outcome, size, interactive }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number; interactive: boolean }>) {
  const fraction = props.scheduled && props.done !== undefined ? props.done / props.scheduled : 0.5
  const numeralClass = outcome === 'full' ? filledNumeralClass(interactive) : 'text-[var(--fg-2)]'
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size, ...ringStyle(outcome, interactive) }}
    >
      {outcome === 'partial' ? <PartialArc fraction={fraction} size={size} /> : null}
      <span
        className={`relative ${numeralClass}`}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: props.today ? 500 : 400,
        }}
      >
        {props.day}
      </span>
    </span>
  )
}

function HabitHistoryContents({ props, outcome, size, interactive }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number; interactive: boolean }>) {
  const missed = outcome === 'none' || outcome === 'partial'
  const dimmed = outcome === 'not-scheduled'
  let numeralClass = 'text-[var(--fg-2)]'
  if (outcome === 'full') numeralClass = filledNumeralClass(interactive)
  else if (missed) numeralClass = 'text-[var(--fg-3)]'
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: outcome === 'full' && !interactive ? 'var(--fg-1)' : 'transparent', opacity: dimmed ? 0.4 : 1 }}
    >
      <span className={numeralClass} style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: props.today ? 500 : 400 }}>{props.day}</span>
      {missed ? <span className="absolute rounded-full bg-[var(--status-empty)]" style={{ width: 3, height: 3, bottom: 4 }} /> : null}
    </span>
  )
}

export function DayCell(props: Readonly<DayCellProps>) {
  const outcome = resolveDayCellOutcome(props)
  const size = props.size ?? 44
  const interactive = Boolean(props.loggable) && !props.outsideMonth
  const commonProps = {
    'aria-current': props.today ? ('date' as const) : undefined,
    'aria-label': buildDayCellAccessibleName(props, outcome),
    'data-outcome': outcome,
    'data-outside-month': props.outsideMonth ? '' : undefined,
    'data-state': outcome,
    style: {
      width: size,
      height: size,
      boxShadow: props.today ? 'inset 0 0 0 2px var(--primary)' : 'none',
      opacity: props.outsideMonth ? 0 : 1,
    },
  }
  const contents = props.habitHistory
    ? <HabitHistoryContents props={props} outcome={outcome} size={size} interactive={interactive} />
    : <DayCellContents props={props} outcome={outcome} size={size} interactive={interactive} />

  if (interactive) {
    return (
      <button
        {...commonProps}
        type="button"
        onClick={props.onPress}
        className={`group inline-flex shrink-0 items-center justify-center rounded-full border-0 p-0 cursor-pointer transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${outcome === 'full' ? 'bg-[var(--fg-1)]' : 'bg-transparent'}`}
      >
        {contents}
      </button>
    )
  }

  return (
    <div
      {...commonProps}
      role="img"
      aria-hidden={props.outsideMonth ? true : undefined}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
    >
      {contents}
    </div>
  )
}
