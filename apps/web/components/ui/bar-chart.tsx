'use client'

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { BarChartPoint } from '@orbit/shared/contracts/display'
import {
  BAR_CHART_HEIGHT,
  barChartPath,
  nearestBarIndex,
  resolveBarChartGeometry,
  stepSelection,
} from '@orbit/shared/contracts/display'
import { useTranslations } from 'next-intl'

export function BarChart({ points, label }: Readonly<{ points: readonly BarChartPoint[]; label: string }>) {
  const t = useTranslations('charts.bar')
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState(points.length - 1)
  const selectedIndex = Math.max(0, Math.min(selected, points.length - 1))
  const bars = resolveBarChartGeometry(points.map((point) => point.rate), width)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => setWidth(entries[0]!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function selectAt(clientX: number) {
    const left = containerRef.current?.getBoundingClientRect().left ?? 0
    setSelected(nearestBarIndex(clientX - left, bars))
  }

  function handleMove(event: MouseEvent<HTMLDivElement>) {
    if (globalThis.matchMedia('(hover: hover) and (pointer: fine)').matches) selectAt(event.clientX)
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const direction = {
      ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end',
    }[event.key] as 'left' | 'right' | 'home' | 'end' | undefined
    if (!direction) return
    event.preventDefault()
    setSelected((current) => stepSelection(Math.min(current, points.length - 1), points.length, direction))
  }

  if (points.length === 0) return null
  const point = points[selectedIndex]!
  const readout = point.scheduled === 0
    ? `${point.dateLabel}: ${t('nothingScheduled')}`
    : `${point.dateLabel}: ${t('readout', { done: point.completed, scheduled: point.scheduled })}`

  return (
    <div className="flex w-full flex-col gap-2" data-testid="bar-chart">
      <p className="text-sm text-[var(--fg-2)]" aria-live="polite">{readout}</p>
      <div
        ref={containerRef}
        role="slider"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={selectedIndex + 1}
        aria-valuetext={readout}
        tabIndex={0}
        onKeyDown={handleKey}
        onClick={(event) => selectAt(event.clientX)}
        onMouseMove={handleMove}
        className="h-24 w-full cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]"
      >
        <svg aria-hidden="true" focusable="false" width="100%" height={BAR_CHART_HEIGHT} viewBox={`0 0 ${width || 1} ${BAR_CHART_HEIGHT}`} preserveAspectRatio="none">
          {bars.map((bar, index) => {
            const empty = points[index]!.rate == null || points[index]!.rate === 0
            const state = empty ? 'empty' : index === selectedIndex ? 'selected' : 'resting'
            return <path key={index} d={barChartPath(bar)} data-state={state} fill={empty ? 'var(--track-empty)' : index === selectedIndex ? 'var(--fg-1)' : 'var(--fg-2)'} className="motion-reduce:!transition-none" style={{ transition: 'fill 240ms var(--ease-standard)' }} />
          })}
        </svg>
      </div>
      <div className="flex justify-between font-mono text-xs tabular-nums text-[var(--fg-3)]" aria-hidden="true">
        <span>{points[0]!.dateLabel}</span><span>{points.at(-1)?.dateLabel}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>{t('date')}</th><th>{t('rate')}</th><th>{t('completed')}</th></tr></thead>
        <tbody>{points.map((entry, index) => <tr key={index}><td>{entry.dateLabel}</td><td>{entry.rate == null ? t('nothingScheduled') : `${entry.rate}%`}</td><td>{t('readout', { done: entry.completed, scheduled: entry.scheduled })}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
