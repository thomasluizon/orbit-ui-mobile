'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ShowRecurringToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Checkbox + label controlling whether recurring habits appear in a calendar
 *  surface. Shared by the day detail and the week/interval views so the control
 *  reads and behaves identically everywhere. */
export function ShowRecurringToggle({
  checked,
  onChange,
}: Readonly<ShowRecurringToggleProps>) {
  const t = useTranslations()
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm text-[var(--fg-2)] cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="flex items-center justify-center shrink-0 transition-[background-color,box-shadow] duration-[var(--dur-fast)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--primary)]"
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          background: checked ? 'var(--primary)' : 'transparent',
          boxShadow: checked ? 'none' : 'inset 0 0 0 2px var(--fg-3)',
        }}
      >
        {checked && <Check size={13} strokeWidth={3} color="var(--fg-on-primary)" />}
      </span>
      {t('calendar.showRecurring')}
    </label>
  )
}
