'use client'

import { useEffect, useMemo, useRef } from 'react'
import { buildYearRange } from '@orbit/shared/utils'

interface YearPickerProps {
  selectedYear: number
  onSelectYear: (year: number) => void
}

/** Compact, scrollable grid of selectable years. Surfaces (the calendar header
 *  and the date picker) wrap it in their own overlay; this owns only the grid,
 *  the selected highlight, and scrolling the selection into view. */
export function YearPicker({
  selectedYear,
  onSelectYear,
}: Readonly<YearPickerProps>) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  const years = useMemo(() => buildYearRange(selectedYear), [selectedYear])

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <div className="thin-scrollbar overflow-y-auto" style={{ maxHeight: 240 }}>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: 4 }}
      >
        {years.map((year) => {
          const isSelected = year === selectedYear
          return (
            <button
              key={year}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectYear(year)}
              className={
                'appearance-none border-0 cursor-pointer rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96] ' +
                (isSelected ? '' : 'hover:bg-[var(--bg-elev)]')
              }
              style={{
                padding: '10px 0',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: isSelected ? 700 : 500,
                fontVariantNumeric: 'tabular-nums',
                color: isSelected ? 'var(--fg-on-primary)' : 'var(--fg-1)',
                background: isSelected ? 'var(--primary)' : undefined,
              }}
            >
              {year}
            </button>
          )
        })}
      </div>
    </div>
  )
}
