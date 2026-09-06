'use client'

import type { ReactNode } from 'react'
import { CommandItem } from 'cmdk'

interface CommandRowProps {
  leading: ReactNode
  label: string
  value: string
  onSelect: () => void
  description?: ReactNode
}

/**
 * A single command-palette row: a leading glyph slot plus a label inside a 44px
 * hit target styled to the Orbit token system. The active row is primary-tinted.
 */
export function CommandRow({ leading, label, value, onSelect, description }: Readonly<CommandRowProps>) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className="flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-[var(--r-well)] px-3 text-[16px] text-[var(--fg-1)] transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-standard)] [&_svg]:text-[var(--fg-3)] data-[selected=true]:bg-[var(--primary-dim)] data-[selected=true]:shadow-[inset_0_0_0_1.5px_var(--primary)] active:scale-[0.96]"
    >
      <span className="grid size-[26px] shrink-0 place-items-center">{leading}</span>
      <span className="min-w-0 flex-1"><span className="block truncate leading-tight">{label}</span>{description}</span>
    </CommandItem>
  )
}
