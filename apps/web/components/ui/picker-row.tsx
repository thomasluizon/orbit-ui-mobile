'use client'

import * as Primitive from '@radix-ui/react-toggle'

import { useState, type ReactNode } from 'react'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'

interface PickerRowProps {
  name: string
  selected: boolean
  proposed?: boolean
  disabled: boolean
  onToggle: () => void
  value: ReactNode
  valueClassName: string
  valueHidden?: boolean
  controlClassName: string
  actionsClassName: string
  children?: ReactNode
}

export function PickerRow({ name, selected, proposed = false, disabled, onToggle, value, valueClassName, valueHidden, controlClassName, actionsClassName, children }: Readonly<PickerRowProps>) {
  const [clamped, setClamped] = useState(false)
  return (
    <div data-picker-row="" className="flex flex-col rounded-[12px] px-3 py-2" style={{ minHeight: 'max(120px, calc(2.8em + 72px))' }}>
      <Primitive.Root pressed={selected} aria-label={name} disabled={disabled} className={`${controlClassName} group/picker`} onPressedChange={onToggle}>
        <PersonalText onClampedChange={setClamped} className={`w-full leading-[1.4]${proposed ? ' text-[var(--fg-3)] group-hover/picker:text-[var(--fg-2)] group-active/picker:text-[var(--fg-2)]' : ''}`}>{name}</PersonalText>
      </Primitive.Root>
      <div className={actionsClassName}>
        <span aria-hidden={valueHidden || undefined} className={valueClassName}>{value}</span>
        <PersonalTextDetails iconOnly clamped={clamped}>{name}</PersonalTextDetails>
        {children}
      </div>
    </div>
  )
}
