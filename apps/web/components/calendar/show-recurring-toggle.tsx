'use client'

import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/settings-row'

interface ShowRecurringToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Kit Switch + label controlling whether recurring habits appear in a calendar
 *  surface. Shared by the day detail and the week/interval views so the control
 *  reads and behaves identically everywhere. */
export function ShowRecurringToggle({
  checked,
  onChange,
}: Readonly<ShowRecurringToggleProps>) {
  const t = useTranslations()
  return (
    <span className="flex shrink-0 items-center gap-2" style={{ minHeight: 44 }}>
      <Switch
        on={checked}
        onToggle={() => onChange(!checked)}
        ariaLabel={t('calendar.showRecurring')}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => onChange(!checked)}
        className="appearance-none border-0 bg-transparent p-0 cursor-pointer select-none text-sm text-[var(--fg-2)]"
      >
        {t('calendar.showRecurring')}
      </button>
    </span>
  )
}
