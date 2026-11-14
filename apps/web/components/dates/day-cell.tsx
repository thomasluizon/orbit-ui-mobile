'use client'

import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import { useContext, type CSSProperties } from 'react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { useFlag } from '@/hooks/use-flag'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { MovingDaySelection } from './month-selection'
import { DayColumnContent } from './day-column-content'
import { SelectionIndicator } from '@/components/ui/selection-indicator'
import type { DayCellProps, DayOutcome } from '@orbit/shared/contracts/dates'
import { buildDayCellAccessibleName, resolveDayCellOutcome } from '@orbit/shared/utils'

function ringStyle(outcome: DayOutcome): CSSProperties {
  if (outcome === 'full') return { background: 'var(--fg-1)' }
  if (outcome === 'not-scheduled') return { background: 'transparent' }
  if (outcome === 'none') return { boxShadow: 'inset 0 0 0 2px var(--status-empty)' }
  return {}
}

/** Feedback stays on the day disc inside its transparent target. */
function PressFill({ selected = false }: Readonly<{ selected?: boolean }>) {
  if (selected) return null
  return (
    <span
      aria-hidden="true"
      data-press-fill=""
      className="pointer-events-none absolute inset-0 rounded-full bg-[var(--bg-hover)] opacity-0 transition-opacity duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
    />
  )
}

const ARC_SWEEP = `stroke-dashoffset ${motionDurations.slow}ms cubic-bezier(${motionEasings.standard.join(', ')})`

/** The share of the day done, drawn on a path length of 100. With the guided flows on, a log sweeps the arc from the old share to the new one; the flag off and reduced motion draw the new share at once. */
function PartialArc({ fraction, size }: Readonly<{ fraction: number; size: number }>) {
  const guided = useFlag('orbit_guided_flows')
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
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
        strokeDasharray="100 100"
        strokeDashoffset={100 - sweep}
        strokeLinecap="round"
        strokeWidth={stroke}
        data-day-arc=""
        style={guided && !reducedMotion ? { transition: ARC_SWEEP } : undefined}
      />
    </svg>
  )
}

function DayCellContents({ props, outcome, size }: Readonly<{ props: DayCellProps; outcome: DayOutcome; size: number }>) {
  if (props.future) return <span data-day-future-numeral="" style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{props.day}</span>
  if (props.habitHistory) return <HabitHistoryContents props={props} outcome={outcome} size={size} />
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
  const selectionId = useContext(MovingDaySelection)
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
  const contents = <DayCellContents props={props} outcome={outcome} size={statusSize} />
  const showPositionRing = (props.today || props.selected) && !(props.selected && selectionId)
  const circle = <span
    data-day-circle=""
    className={'orbit-day-circle isolate relative inline-flex items-center justify-center ' + (props.selected ? 'orbit-day-selected' : props.loggable || props.raised ? 'orbit-day-well' : '')}
    style={{ width: statusSize, height: statusSize, flexShrink: 0, borderRadius: statusSize / 2 }}
  >
    {props.selected && selectionId ? <SelectionIndicator id={selectionId} calendar /> : null}
    <PressFill selected={props.selected} />
    {contents}
    <span aria-hidden="true" data-day-position-ring="" className="pointer-events-none absolute inset-0"
      style={{ borderRadius: 'inherit', boxShadow: `var(--day-focus-ring, ${showPositionRing ? 'inset 0 0 0 2px var(--primary)' : 'none'})` }} />
  </span>
  const alignedCircle = <DayColumnContent>{circle}</DayColumnContent>

  if (interactive) {
    return <button {...commonProps} type="button" onClick={props.onPress}
      aria-pressed={props.selected}
      className="orbit-day-target group relative inline-flex shrink-0 items-center justify-center border-0 bg-transparent p-0 cursor-pointer">
      {alignedCircle}
    </button>
  }
  return <span {...commonProps} role="img" aria-hidden={props.outsideMonth ? true : undefined}
    className="inline-flex shrink-0 items-center justify-center">{alignedCircle}</span>
}
