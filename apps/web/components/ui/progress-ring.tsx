'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ProgressRingProps } from '@orbit/shared/contracts/display'

/** A circular progress sweep over a neutral track. */
export function ProgressRing({ value = 0, size = 64, label }: Readonly<ProgressRingProps>) {
  const clamped = Math.min(100, Math.max(0, value))
  const complete = clamped === 100
  const strokeWidth = Math.max(2, size / 16)
  const radius = (size - strokeWidth) / 2
  const [circumference, setCircumference] = useState(0)
  const [canAnimate, setCanAnimate] = useState(false)
  const measure = useCallback((circle: SVGCircleElement | null) => {
    if (!circle) return
    setCanAnimate(false)
    setCircumference(circle.getTotalLength())
  }, [])

  useEffect(() => {
    if (circumference === 0) return
    const frame = requestAnimationFrame(() => setCanAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [circumference])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      data-complete={complete || undefined}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track-empty)" strokeWidth={strokeWidth} />
      <circle
        ref={measure}
        key={size}
        className={canAnimate
          ? 'transition-[stroke-dashoffset] duration-[var(--dur-base)] ease-[var(--ease-standard)] motion-reduce:transition-none'
          : undefined}
        visibility={circumference > 0 ? undefined : 'hidden'}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={complete ? 'var(--fg-3)' : 'var(--primary)'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
