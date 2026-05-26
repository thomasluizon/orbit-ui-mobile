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
        className="w-full appearance-none bg-[var(--bg-elev)] text-[var(--fg-1)] rounded-md py-3 pr-10 pl-4 text-sm border border-[var(--hairline)] text-left focus:outline-none focus:border-[var(--primary)] transition-colors duration-[var(--duration-fast)]"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-[var(--bg-elev)] text-[var(--fg-1)]"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-3)]" />
    </div>
  )
}
