'use client'

import { useId, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Clock3, X } from '@/components/ui/icons'
import { RadioRow } from '@/components/ui/select-check'
import { Sheet } from '@/components/ui/sheet'
import { formatLocaleTime } from '@orbit/shared/utils'

interface TimeFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}

const HALF_HOURS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  return `${String(hour).padStart(2, '0')}:${minute}`
})

export function TimeField({
  id,
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  disabled = false,
  className = '',
}: Readonly<TimeFieldProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const generatedId = useId()
  const [open, setOpen] = useState(false)
  const options = useMemo(
    () => value && !HALF_HOURS.includes(value) ? [...HALF_HOURS, value].sort() : HALF_HOURS,
    [value],
  )
  const displayValue = value
    ? formatLocaleTime(value, locale, { hour: 'numeric', minute: '2-digit' })
    : ''
  const canClear = !disabled && value.length > 0 && onClear != null

  return (
    <div className={`relative ${className}`}>
      <button
        id={id ?? generatedId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? (displayValue || t('common.selectTime'))}
        onClick={() => setOpen(true)}
        className="flex w-full min-h-[54px] items-center justify-between rounded-[14px] bg-[var(--bg-field)] px-4 py-3 text-left text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,box-shadow,color] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-60"
        style={canClear ? { paddingRight: 48 } : undefined}
      >
        <span className={displayValue ? '' : 'text-[var(--fg-3)]'}>
          {displayValue || placeholder || t('common.selectTime')}
        </span>
        {!canClear ? <Clock3 size={20} strokeWidth={1.8} aria-hidden="true" /> : null}
      </button>
      {canClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={t('common.clear')}
          className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-sunk)]"
          style={{ width: 44, height: 44 }}
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}
      {open ? (
        <Sheet open title={t('common.selectTime')} onClose={() => setOpen(false)}>
          <div role="radiogroup" aria-label={t('common.selectTime')}>
            {options.map((option, index) => (
              <RadioRow
                key={option}
                label={formatLocaleTime(option, locale, { hour: 'numeric', minute: '2-digit' })}
                selected={option === value}
                divider={index < options.length - 1}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  )
}
