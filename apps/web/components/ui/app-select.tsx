'use client'

import { ChevronDown } from '@/components/ui/icons'

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
        className="w-full appearance-none min-h-[54px] bg-[var(--bg-field)] text-[var(--fg-1)] rounded-[14px] py-3 pr-10 pl-4 text-base shadow-[inset_0_0_0_1px_var(--hairline)] text-left focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-[background-color,box-shadow,color] duration-[var(--dur-fast)]"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-[var(--bg-sheet)] text-[var(--fg-1)]"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={20}
        strokeWidth={1.8}
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--fg-4)]"
      />
    </div>
  )
}
