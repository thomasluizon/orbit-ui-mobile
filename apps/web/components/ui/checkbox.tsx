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
      data-slot="checkbox-box"
      aria-hidden="true"
      className="relative grid size-[24px] shrink-0 place-items-center rounded-[8px]"
    >
      <svg width={24} height={24} viewBox="0 0 24 24" className="absolute inset-0" aria-hidden="true" focusable="false">
        <rect width={24} height={24} rx={8} fill={checked ? 'var(--status-done)' : 'transparent'} />
        {error || !checked ? <rect x={1} y={1} width={22} height={22} rx={7} fill="none" stroke={error ? 'var(--status-bad)' : 'var(--fg-3)'} strokeWidth={2} /> : null}
      </svg>
      {loading ? (
        <Loader2 size={16} className="relative animate-spin text-[var(--bg)]" />
      ) : checked ? (
        <Check size={16} strokeWidth={3} className="relative text-[var(--bg)]" />
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
      className="grid min-h-[var(--touch-min)] min-w-[var(--touch-min)] place-items-center border-0 bg-transparent p-0 disabled:opacity-60"
    >
      {box}
    </button>
  )
}
