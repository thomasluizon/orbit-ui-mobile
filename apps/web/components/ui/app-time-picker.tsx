'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { formatLocaleTime } from '@orbit/shared/utils'
import { useDeviceLocale } from '@/hooks/use-device-locale'

interface AppTimePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}

export function AppTimePicker({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  className = 'form-input',
}: Readonly<AppTimePickerProps>) {
  const t = useTranslations()
  const locale = useDeviceLocale()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const displayValue = value ? formatLocaleTime(value, locale) : ''

  return (
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
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
