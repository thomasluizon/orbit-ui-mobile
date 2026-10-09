'use client'

import type { ReactNode } from 'react'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'

interface PickerRowProps {
  name: string
  selected: boolean
  disabled: boolean
  onToggle: () => void
  value: ReactNode
  valueClassName: string
  valueHidden?: boolean
  controlClassName: string
  actionsClassName: string
  children?: ReactNode
}

export function PickerRow({ name, selected, disabled, onToggle, value, valueClassName, valueHidden, controlClassName, actionsClassName, children }: Readonly<PickerRowProps>) {
  return (
    <div data-picker-row="" className="flex flex-col rounded-[12px] px-3 py-2" style={{ minHeight: 'max(120px, calc(2.8em + 72px))' }}>
      <button type="button" aria-label={name} aria-pressed={selected} disabled={disabled} className={controlClassName} onClick={onToggle}>
        <PersonalText className="w-full leading-[1.4]">{name}</PersonalText>
      </button>
      <div className={actionsClassName}>
        <span aria-hidden={valueHidden || undefined} className={valueClassName}>{value}</span>
        <PersonalTextDetails iconOnly>{name}</PersonalTextDetails>
        {children}
      </div>
    </div>
  )
}
