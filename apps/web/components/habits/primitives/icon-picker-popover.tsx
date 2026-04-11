'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, X } from 'lucide-react'
import { HABIT_ICON_KEYS, HABIT_ICON_MAP, type HabitIconKey } from '@/lib/habit-icon-catalog'

interface IconPickerPopoverProps {
  value: string | null | undefined
  onChange: (next: string | null) => void
  accentColor?: string | null
}

/**
 * Inline icon picker rendered inside the Appearance section.
 * Not a floating Radix popover — the habit form already lives inside a
 * dialog/drawer, so we render the grid inline for simplicity.
 */
export function IconPickerPopover({ value, onChange, accentColor }: Readonly<IconPickerPopoverProps>) {
  const t = useTranslations()
  const [search, setSearch] = useState('')

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return HABIT_ICON_KEYS
    return HABIT_ICON_KEYS.filter((key) => key.includes(q))
  }, [search])

  const accent = accentColor && /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : undefined

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('habits.form.iconSearchPlaceholder')}
          className="form-input pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-surface-elevated"
            aria-label={t('common.clear')}
          >
            <X className="size-3.5 text-text-muted" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto p-1">
        {filteredKeys.map((key) => {
          const Icon = HABIT_ICON_MAP[key as HabitIconKey]
          if (!Icon) return null
          const active = value === key
          return (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={active}
              onClick={() => onChange(active ? null : key)}
              className={`flex items-center justify-center aspect-square rounded-lg transition-all ${
                active
                  ? 'ring-2 ring-offset-1 ring-offset-surface'
                  : 'border border-border-muted hover:border-border-emphasis bg-surface-ground hover:bg-surface-elevated'
              }`}
              style={
                active && accent
                  ? { background: `${accent}22`, boxShadow: `0 0 0 2px ${accent}` }
                  : undefined
              }
            >
              <Icon
                className="size-4"
                style={active && accent ? { color: accent } : undefined}
              />
            </button>
          )
        })}
      </div>

      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          {t('habits.form.removeIcon')}
        </button>
      )}
    </div>
  )
}
