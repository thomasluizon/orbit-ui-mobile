'use client'

import { useTranslations } from 'next-intl'
import { RANGE_PRESETS, type RangePreset } from './range'

const RANGE_LABEL_KEYS: Record<RangePreset, string> = {
  week: 'insights.rangeWeek',
  month: 'insights.rangeMonth',
  quarter: 'insights.rangeQuarter',
  year: 'insights.rangeYear',
}

interface RangeSelectorProps {
  value: RangePreset
  onChange: (preset: RangePreset) => void
}

/**
 * Pill toggle row that drives the dashboard's date window. Reuses the kit `chip`
 * language with a 44px hit target per pill.
 */
export function RangeSelector({ value, onChange }: Readonly<RangeSelectorProps>) {
  const t = useTranslations()

  return (
    <div className="flex flex-wrap gap-2">
      {RANGE_PRESETS.map((preset) => {
        const isActive = preset === value
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(preset)}
            className={`chip min-h-[44px] ${isActive ? 'chip-active' : ''}`}
          >
            {t(RANGE_LABEL_KEYS[preset])}
          </button>
        )
      })}
    </div>
  )
}
