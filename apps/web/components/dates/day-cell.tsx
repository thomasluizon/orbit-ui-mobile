'use client'

import type { CSSProperties } from 'react'
import type { DayCellProps, DayOutcome } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '@orbit/shared/utils'

function ringStyle(outcome: DayOutcome): CSSProperties {
  if (outcome === 'full') return { background: 'var(--fg-1)' }
  if (outcome === 'not-scheduled' || outcome === 'unavailable') return { background: 'var(--bg-well)' }
  if (outcome === 'future') return { boxShadow: 'inset 0 0 0 1px var(--hairline-strong)' }
  if (outcome === 'none') return { boxShadow: 'inset 0 0 0 2px var(--fg-4)' }
  return {}
}

function PartialArc({ fraction, size }: Readonly<{ fraction: number; size: number }>) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const center = size / 2
  const sweep = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <svg aria-hidden="true" width={size} height={size} className="absolute inset-0 -rotate-90">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--fg-4)" strokeWidth={stroke} />
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

function DayCellContents({ props, outcome, size }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number }>) {
  const fraction = props.scheduled && props.done !== undefined ? props.done / props.scheduled : 0.5
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size, ...ringStyle(outcome) }}
    >
      {outcome === 'partial' ? <PartialArc fraction={fraction} size={size} /> : null}
      <span
        className="relative"
        style={{
          color: outcome === 'full' ? 'var(--bg)' : 'var(--fg-2)',
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

function HabitHistoryContents({ props, outcome, size }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number }>) {
  const missed = outcome === 'none' || outcome === 'partial'
  const dimmed = outcome === 'not-scheduled' || outcome === 'unavailable'
  const textColor = outcome === 'full'
    ? 'var(--bg)'
    : outcome === 'future'
      ? 'var(--fg-4)'
      : missed
        ? 'var(--fg-3)'
        : 'var(--fg-2)'
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: outcome === 'full' ? 'var(--fg-1)' : 'transparent', opacity: dimmed ? 0.4 : 1 }}
    >
      <span style={{ color: textColor, fontFamily: 'var(--font-mono)', fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: props.today ? 500 : 400 }}>{props.day}</span>
      {missed ? <span className="absolute rounded-full bg-[var(--fg-4)]" style={{ width: 3, height: 3, bottom: 4 }} /> : null}
    </span>
  )
}

export function DayCell(props: Readonly<DayCellProps>) {
  const outcome = resolveDayCellOutcome(props)
  const size = props.size ?? 44
  const commonProps = {
    'aria-current': props.today ? ('date' as const) : undefined,
    'aria-label': buildDayCellAccessibleName(props, outcome),
    'data-outcome': outcome,
    'data-outside-month': props.outsideMonth ? '' : undefined,
    'data-selected': props.selected ? '' : undefined,
    'data-state': outcome,
    style: {
      width: size,
      height: size,
      background: props.selected ? 'var(--selection-bg)' : 'transparent',
      boxShadow: props.selected || props.today ? 'inset 0 0 0 2px var(--primary)' : 'none',
      opacity: props.outsideMonth ? 0 : 1,
    },
  }

  if (props.loggable && !props.outsideMonth) {
    return (
      <button
        {...commonProps}
        type="button"
        onClick={props.onPress}
        className="inline-flex shrink-0 items-center justify-center rounded-full border-0 p-0 cursor-pointer transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      >
        {props.habitHistory ? <HabitHistoryContents props={props} outcome={outcome} size={size} /> : <DayCellContents props={props} outcome={outcome} size={size} />}
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
      {props.habitHistory ? <HabitHistoryContents props={props} outcome={outcome} size={size} /> : <DayCellContents props={props} outcome={outcome} size={size} />}
    </div>
  )
}
