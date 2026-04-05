'use client'

import { ChevronDown } from 'lucide-react'

interface AppSelectOption {
  value: string
  label: string
}

interface AppSelectProps {
  value: string | null
  onChange: (value: string) => void
  options: AppSelectOption[]
  label?: string
}

export function AppSelect({
  value,
  onChange,
  options,
  label,
}: Readonly<AppSelectProps>) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full appearance-none bg-surface text-text-primary rounded-md py-3 pr-10 pl-4 text-sm border border-border text-left focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors duration-[var(--duration-fast)]"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-surface text-text-primary"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
    </div>
  )
}
