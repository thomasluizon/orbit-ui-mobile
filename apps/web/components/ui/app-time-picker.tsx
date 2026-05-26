'use client'

import { useId } from 'react'
import { X } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { formatLocaleTime } from '@orbit/shared/utils'

interface AppTimePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Optional clear callback. When provided and value is set, an X button
   *  is rendered on the right edge; tapping it invokes onClear. */
  onClear?: () => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}

export function AppTimePicker({
  id,
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  disabled = false,
  className = 'form-input',
}: Readonly<AppTimePickerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const displayValue = value ? formatLocaleTime(value, locale) : ''
  const canClear = !disabled && !!value && !!onClear

  return (
    <div className="relative flex items-center">
      <input
        id={inputId}
        type="time"
        value={value}
        disabled={disabled}
        aria-label={
          ariaLabel ??
          (displayValue || placeholder || t('common.selectTime'))
        }
        className={className}
        style={canClear ? { paddingRight: 36 } : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {canClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={t('common.clear')}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-sunk)] hover:text-[var(--fg-1)] transition-colors"
          style={{ width: 24, height: 24 }}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  )
}
