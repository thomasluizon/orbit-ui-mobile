'use client'

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { BarChartPoint } from '@orbit/shared/contracts/display'
import {
  BAR_CHART_HEIGHT,
  barChartPath,
  resolveBarChartGeometry,
  resolveBarChartReadout,
  resolveBarChartSelection,
  stepSelection,
} from '@orbit/shared/contracts/display'
import { useTranslations } from 'next-intl'

export function BarChart({ points, label }: Readonly<{ points: readonly BarChartPoint[]; label: string }>) {
  const t = useTranslations('charts.bar')
  const containerRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLParagraphElement>(null)
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [width, setWidth] = useState(0)
  const [readoutWidth, setReadoutWidth] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const selectedIndex = resolveBarChartSelection(points, selectedDate)
  const bars = resolveBarChartGeometry(points.map((point) => point.rate), width)
  const hasPoints = points.length > 0

  useEffect(() => {
    if (!hasPoints) return
    const container = containerRef.current!
    const readout = readoutRef.current!
    const plotObserver = new ResizeObserver((entries) => setWidth(entries[0]!.contentRect.width))
    const readoutObserver = new ResizeObserver((entries) => setReadoutWidth(entries[0]!.contentRect.width + 20))
    plotObserver.observe(container)
    readoutObserver.observe(readout)
    return () => { plotObserver.disconnect(); readoutObserver.disconnect() }
  }, [hasPoints])

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    const direction = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'left', ArrowDown: 'right', Home: 'home', End: 'end',
    }[event.key] as 'left' | 'right' | 'home' | 'end' | undefined
    if (!direction) return
    event.preventDefault()
    const next = stepSelection(selectedIndex, points.length, direction)
    setSelectedDate(points[next]!.startDate)
    radioRefs.current[next]?.focus()
  }

  function describePoint(point: BarChartPoint) {
    return point.scheduled === 0
      ? t('unscheduledDay', { date: point.readoutDateLabel })
      : t('selectedDay', { date: point.readoutDateLabel, rate: point.rate ?? 0, done: point.completed, scheduled: point.scheduled })
  }

  if (!hasPoints) return null
  return (
    <div className="orbit-bar-chart flex w-full min-w-0 flex-col gap-2" data-testid="bar-chart">
      <div className="w-full">
        <p ref={readoutRef} data-slot="bar-chart-readout" aria-live="polite" aria-atomic="true" className="relative w-max max-w-full rounded-[8px] p-2 text-sm leading-[1.4] tabular-nums text-[var(--fg-1)] [overflow-wrap:anywhere]" style={{ left: resolveBarChartReadout(width, readoutWidth, selectedIndex, points.length) }}>
          {describePoint(points[selectedIndex]!)}
        </p>
      </div>
      <div ref={containerRef} data-interaction-fill-grid="" role="radiogroup" aria-label={label} className="relative flex w-full" style={{ height: BAR_CHART_HEIGHT }}>
        {points.map((point, index) => <button
          key={point.startDate}
          ref={(element) => { radioRefs.current[index] = element }}
          type="button"
          role="radio"
          aria-label={describePoint(point)}
          aria-checked={index === selectedIndex}
          tabIndex={index === selectedIndex ? 0 : -1}
          onClick={() => setSelectedDate(point.startDate)}
          onKeyDown={handleKey}
          className="orbit-bar-chart-column group relative min-w-0 flex-1 cursor-pointer touch-manipulation rounded-none bg-transparent p-0 focus-visible:outline-0"
        >
          {bars[index] ? <>
            <svg data-slot="bar-chart-fill" aria-hidden="true" focusable="false" className="pointer-events-none absolute" style={{ left: bars[index].x - bars[index].slotStart, top: bars[index].y, width: bars[index].width, height: bars[index].height }} viewBox={`${bars[index].x} ${bars[index].y} ${bars[index].width} ${bars[index].height}`} preserveAspectRatio="none">
              <path d={barChartPath(bars[index])} data-state={index === selectedIndex ? 'selected' : 'resting'} data-empty={point.rate == null || point.rate === 0 || undefined}
                className="transition-[fill] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover:fill-[var(--fg-1)] group-active:fill-[var(--fg-1)] motion-reduce:transition-none" fill={index === selectedIndex ? 'var(--fg-1)' : 'var(--fg-2)'} />
            </svg>
          </> : null}
        </button>)}
      </div>
      <div className="flex justify-between font-mono text-xs tabular-nums text-[var(--fg-3)]" aria-hidden="true">
        <span>{points[0]!.dateLabel}</span><span>{points.at(-1)?.dateLabel}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>{t('date')}</th><th>{t('rate')}</th><th>{t('completed')}</th></tr></thead>
        <tbody>{points.map((entry) => <tr key={entry.startDate}><td>{entry.readoutDateLabel}</td><td>{entry.scheduled === 0 ? t('nothingScheduled') : `${entry.rate ?? 0}%`}</td><td>{t('readout', { done: entry.completed, scheduled: entry.scheduled })}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
