'use client'

import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import type { CSSProperties } from 'react'
import type { DayCellProps, DayOutcome } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '@orbit/shared/utils'

function ringStyle(outcome: DayOutcome): CSSProperties {
  if (outcome === 'full') return { background: 'var(--fg-1)' }
  if (outcome === 'not-scheduled') return { background: 'transparent' }
  if (outcome === 'none') return { boxShadow: 'inset 0 0 0 2px var(--status-empty)' }
  return {}
}

/** The translucent hover layer covers the round hit area below the day's foreground. */
function PressFill() {
  return (
    <span
      aria-hidden="true"
      data-press-fill=""
      className="pointer-events-none absolute inset-0 rounded-full bg-[var(--bg-hover)] opacity-0 transition-opacity duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover:opacity-100 group-active:opacity-100"
    />
  )
}

function PartialArc({ fraction, size }: Readonly<{ fraction: number; size: number }>) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const center = size / 2
  const sweep = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <svg aria-hidden="true" width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
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

function DayCellContents({ props, outcome, size }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number }>) {
  const fraction = props.scheduled && props.done !== undefined ? props.done / props.scheduled : 0.5
  const numeralClass = outcome === 'full' ? 'text-[var(--bg)]' : 'text-[var(--fg-2)]'
  return (
    <span
      aria-hidden="true"
      data-day-disc=""
      className="relative inline-flex items-center justify-center"
      style={{ width: '100%', maxWidth: size, aspectRatio: 1, borderRadius: size / 2, ...ringStyle(outcome) }}
    >
      {outcome === 'full' ? <PressFill /> : null}
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

function HabitHistoryContents({ props, outcome, size }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number }>) {
  const missed = outcome === 'none' || outcome === 'partial'
  const dimmed = outcome === 'not-scheduled'
  let numeralClass = 'text-[var(--fg-2)]'
  if (outcome === 'full') numeralClass = 'text-[var(--bg)]'
  else if (missed) numeralClass = 'text-[var(--fg-2)]'
  return (
    <span
      aria-hidden="true"
      data-day-disc=""
      className="relative inline-flex items-center justify-center"
      style={{ width: '100%', maxWidth: size, aspectRatio: 1, borderRadius: size / 2, background: outcome === 'full' ? 'var(--fg-1)' : 'transparent', opacity: dimmed ? 0.4 : 1 }}
    >
      {outcome === 'full' ? <PressFill /> : null}
      <span className={`relative ${numeralClass}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: props.today ? 500 : 400 }}>{props.day}</span>
      {missed ? <span className="absolute rounded-full bg-[var(--status-empty)]" style={{ width: 3, height: 3, bottom: 4 }} /> : null}
    </span>
  )
}

export function DayCell(props: Readonly<DayCellProps>) {
  const outcome = resolveDayCellOutcome(props)
  const size = props.size ?? MONTH_GRID_TARGET_MIN
  const statusSize = 34
  const interactive = Boolean(props.loggable) && !props.outsideMonth
  const commonProps = {
    'aria-current': props.today ? ('date' as const) : undefined,
    'aria-label': buildDayCellAccessibleName(props, outcome),
    'data-outcome': props.future ? undefined : outcome,
    'data-outside-month': props.outsideMonth ? '' : undefined,
    'data-state': outcome,
    style: { width: '100%', minHeight: Math.max(size, MONTH_GRID_TARGET_MIN), opacity: props.outsideMonth ? 0 : 1 },
  }
  const contents = props.future
    ? <span style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{props.day}</span>
    : props.habitHistory
      ? <HabitHistoryContents props={props} outcome={outcome} size={statusSize} />
      : <DayCellContents props={props} outcome={outcome} size={statusSize} />
  const circle = <span
    data-day-circle=""
    className="orbit-day-circle relative inline-flex items-center justify-center rounded-full"
    style={{ width: '100%', maxWidth: size, aspectRatio: 1, background: props.selected ? 'var(--selection-bg)' : props.loggable || props.raised ? 'var(--bg-well)' : 'transparent', '--day-ring': props.today || props.selected ? 'inset 0 0 0 2px var(--primary)' : 'none' } as CSSProperties}
  >
    <PressFill />
    {contents}
  </span>

  if (interactive) {
    return <button {...commonProps} type="button" onClick={props.onPress}
      aria-pressed={props.selected}
      className="orbit-day-target group relative inline-flex shrink-0 items-center justify-center border-0 bg-transparent p-0 cursor-pointer">
      {circle}
    </button>
  }
  return <span {...commonProps} role="img" aria-hidden={props.outsideMonth ? true : undefined}
    className="inline-flex shrink-0 items-center justify-center">{circle}</span>
}
