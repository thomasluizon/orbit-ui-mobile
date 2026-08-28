'use client'

import type { CheckboxProps } from '@orbit/shared/contracts/forms'
import { Check, Loader2 } from '@/components/ui/icons'

export function Checkbox({
  checked,
  onChange,
  label,
  error = false,
  disabled = false,
  loading = false,
  as = 'button',
}: Readonly<CheckboxProps>) {
  const box = (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-[8px]"
      style={{
        background: checked ? 'var(--status-done)' : 'transparent',
        boxShadow: error
          ? 'inset 0 0 0 2px var(--status-bad)'
          : checked
            ? 'none'
            : 'inset 0 0 0 2px var(--fg-3)',
      }}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin text-[var(--bg)]" />
      ) : checked ? (
        <Check size={16} strokeWidth={3} className="text-[var(--bg)]" />
      ) : null}
    </span>
  )

  if (as === 'span') return box

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
      className="grid min-h-11 min-w-11 place-items-center border-0 bg-transparent p-0 disabled:opacity-60"
    >
      {box}
    </button>
  )
}
