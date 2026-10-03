'use client'

import { useEffect, useMemo, useRef } from 'react'
import { buildYearRange } from '@orbit/shared/utils'
import { revealFocusedControl } from '@/lib/focus-scroll'

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
    <div data-focus-inset="" onFocusCapture={revealFocusedControl} className="thin-scrollbar min-h-0 overflow-y-auto overscroll-contain" style={{ maxHeight: 240 }}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: 'minmax(48px, auto)',
          columnGap: 4,
          rowGap: 4,
          padding: 4,
        }}
      >
        {years.map((year) => {
          const isSelected = year === selectedYear
          return (
            <button
              key={year}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              aria-pressed={isSelected}
              data-focus-on-primary={isSelected ? '' : undefined}
              onClick={() => onSelectYear(year)}
              className={`min-h-12 w-full rounded-full appearance-none border-0 cursor-pointer p-0 transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] active:scale-[0.96] ${isSelected ? 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)]' : 'bg-[var(--bg-field)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]'}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
                color: isSelected ? 'var(--fg-on-primary)' : 'var(--fg-1)',
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
