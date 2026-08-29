'use client'

import type { CheckRowProps } from '@orbit/shared/contracts/forms'
import { Checkbox } from './checkbox'

export function CheckRow({
  label,
  checked,
  onChange,
  description,
  error,
  value,
  disabled = false,
  loading = false,
}: Readonly<CheckRowProps>) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      data-checked={checked ? '' : undefined}
      data-loading={loading ? '' : undefined}
      data-error={error ? '' : undefined}
      className="flex min-h-14 w-full items-center gap-3 border-0 bg-transparent px-4 py-2 text-left hover:bg-[var(--bg-hover)] disabled:opacity-60"
    >
      <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={`text-base font-medium ${checked ? 'text-[var(--fg-3)] line-through' : 'text-[var(--fg-1)]'}`}
        >
          {label}
        </span>
        {error || description ? (
          <span className={`text-sm ${error ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-3)]'}`}>
            {error ?? description}
          </span>
        ) : null}
      </span>
      {value !== undefined ? (
        <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--fg-3)]">{value}</span>
      ) : null}
    </button>
  )
}
