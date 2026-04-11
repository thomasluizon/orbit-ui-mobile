'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Check, X } from 'lucide-react'
import { HABIT_COLOR_PRESETS, isValidHabitColor } from '@/lib/habit-color-palette'

interface ColorPickerRowProps {
  value: string | null | undefined
  onChange: (next: string | null) => void
}

export function ColorPickerRow({ value, onChange }: Readonly<ColorPickerRowProps>) {
  const t = useTranslations()
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState(value ?? '')

  useEffect(() => {
    setCustomValue(value ?? '')
  }, [value])

  const normalizedValue = value?.toLowerCase() ?? null
  const matchedPreset = normalizedValue && HABIT_COLOR_PRESETS.includes(normalizedValue)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {HABIT_COLOR_PRESETS.map((preset) => {
          const active = normalizedValue === preset
          return (
            <button
              key={preset}
              type="button"
              aria-label={preset}
              aria-pressed={active}
              onClick={() => onChange(active ? null : preset)}
              className={`relative size-8 rounded-full transition-transform ${
                active ? 'scale-110 ring-2 ring-offset-2 ring-offset-surface' : 'hover:scale-105'
              }`}
              style={{ background: preset, boxShadow: active ? `0 0 0 2px ${preset}` : undefined }}
            >
              {active && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Check className="size-4 text-white drop-shadow-sm" />
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={!matchedPreset && !!normalizedValue}
          onClick={() => setCustomOpen((prev) => !prev)}
          className={`size-8 rounded-full border-2 border-dashed border-border-emphasis bg-surface-ground flex items-center justify-center text-[10px] font-bold text-text-secondary hover:text-text-primary transition-colors ${
            !matchedPreset && normalizedValue ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary' : ''
          }`}
        >
          {t('habits.form.customColor')}
        </button>
      </div>

      {customOpen && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            onBlur={() => {
              if (isValidHabitColor(customValue)) onChange(customValue.toLowerCase())
            }}
            placeholder="#8b5cf6"
            maxLength={7}
            className="form-input max-w-[140px] font-mono text-xs"
          />
          <div
            className="size-7 rounded-lg border border-border-muted"
            style={{
              background: isValidHabitColor(customValue) ? customValue : 'transparent',
            }}
          />
        </div>
      )}

      {normalizedValue && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <X className="size-3" />
          {t('habits.form.removeColor')}
        </button>
      )}
    </div>
  )
}
