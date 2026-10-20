'use client'

import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import type { ReactNode } from 'react'
import { CommandItem } from 'cmdk'

interface CommandRowProps {
  disclose?: boolean
  textMode?: 'personal'
  leading: ReactNode
  label: string
  value: string
  onSelect: () => void
  disabled?: boolean
  description?: ReactNode
}

/**
 * A single command-palette row: a leading glyph slot plus a label inside a touch-floor
 * hit target styled to the Orbit token system. The active row is primary-tinted.
 */
export function CommandRow({ leading, label, value, onSelect, description, textMode, disclose = false, disabled = false }: Readonly<CommandRowProps>) {
  return (
    <div data-command-result="" className="flex min-w-0 items-center"><CommandItem
      value={value}
      disabled={disabled}
      onSelect={onSelect}
      aria-label={textMode === 'personal' ? label : undefined}
      className="group/habit-result flex-1 min-w-0 flex min-h-[var(--touch-min)] cursor-pointer select-none items-center gap-3 rounded-[var(--r-well)] px-3 text-[17px] text-[var(--fg-1)] transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-standard)] [&_svg]:text-[var(--fg-3)] data-[selected=true]:bg-[var(--primary-dim)] data-[selected=true]:shadow-[inset_0_0_0_1.5px_var(--primary)] active:scale-[0.96]"
    >
      <span className="grid size-6 shrink-0 place-items-center">{leading}</span>
      <span className="min-w-0 flex-1">{textMode === 'personal' ? <PersonalText className="leading-[1.4]">{label}</PersonalText> : <span className="block truncate leading-tight">{label}</span>}{description}</span>
    </CommandItem>{textMode === 'personal' && disclose ? <PersonalTextDetails iconOnly>{label}</PersonalTextDetails> : null}</div>
  )
}
