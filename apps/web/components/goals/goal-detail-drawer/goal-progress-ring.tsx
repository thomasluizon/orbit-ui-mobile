'use client'

import { useEffect, useState } from 'react'

const RING_SIZE = 180
const RING_RADIUS = 70
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

type SweepState = 'initial' | 'sweep' | 'static'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

interface GoalProgressRingProps {
  progressPercentage: number
  percentLabel: string
  progressOfLabel: string
  color: string
}

/** MetaDetalhe progress ring: 12px stroke, round caps. On mount the arc sweeps
 *  in from empty to its value over 280ms (stroke-dashoffset, ease-out), skipped
 *  under prefers-reduced-motion; later value changes animate the same way. */
export function GoalProgressRing({
  progressPercentage,
  percentLabel,
  progressOfLabel,
  color,
}: Readonly<GoalProgressRingProps>) {
  const clamped = Math.min(100, Math.max(0, progressPercentage))
  const [sweepState, setSweepState] = useState<SweepState>(() =>
    prefersReducedMotion() ? 'static' : 'initial',
  )

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSweepState((current) => (current === 'initial' ? 'sweep' : current))
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const targetOffset = RING_CIRCUMFERENCE * (1 - clamped / 100)
  const dashOffset = sweepState === 'initial' ? RING_CIRCUMFERENCE : targetOffset

  return (
    <div className="flex justify-center" style={{ paddingBottom: 4 }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={percentLabel}
        className="relative flex items-center justify-center"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="color-mix(in srgb, var(--fg-1) 8%, transparent)"
            strokeWidth={12}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{
              transition:
                sweepState === 'sweep'
                  ? 'stroke-dashoffset 280ms var(--ease-out)'
                  : undefined,
            }}
          />
        </svg>
        <div className="absolute text-center">
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: 'var(--fg-1)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {Math.round(clamped)}%
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-3)',
            }}
          >
            {progressOfLabel}
          </div>
        </div>
      </div>
    </div>
  )
}
