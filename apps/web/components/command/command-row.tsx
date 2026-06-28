'use client'

import type { ReactNode } from 'react'
import { CommandItem } from 'cmdk'

interface CommandRowProps {
  leading: ReactNode
  label: string
  value: string
  onSelect: () => void
}

/**
 * A single command-palette row: a leading glyph slot plus a label inside a 44px
 * hit target styled to the Orbit token system. The active row is primary-tinted.
 */
export function CommandRow({ leading, label, value, onSelect }: Readonly<CommandRowProps>) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className="flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-[12px] px-2.5 text-[16px] text-[var(--fg-1)] [&_svg]:text-[var(--fg-3)] data-[selected=true]:bg-[rgba(var(--primary-rgb),0.12)] data-[selected=true]:[&_svg]:text-[var(--primary)]"
    >
      <span className="grid size-[26px] shrink-0 place-items-center">{leading}</span>
      <span className="flex-1 truncate leading-tight">{label}</span>
    </CommandItem>
  )
}
