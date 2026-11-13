'use client'

import type { CheckboxProps } from '@orbit/shared/contracts/forms'
import * as Primitive from '@radix-ui/react-checkbox'
import { Check } from '@/components/ui/icons'
import { SkeletonFace } from '@/components/ui/skeleton'

/**
 * The 24px box. Its fill settles on the selection preset (`.orbit-checkbox-box`). While its request runs, its face is
 * the skeleton and the check reads `--fg-1` on it, so the state stays visible.
 */
function CheckboxBox({ checked, error, loading }: Readonly<Pick<CheckboxProps, 'checked'> & { error: boolean; loading: boolean }>) {
  const filled = checked && !loading
  return (
    <span
      data-slot="checkbox-box"
      data-filled={filled ? '' : undefined}
      aria-hidden="true"
      className={`orbit-checkbox-box relative isolate grid size-[24px] shrink-0 place-items-center rounded-[8px] ${filled ? 'bg-[var(--status-done)]' : 'bg-transparent'}`}
    >
      {loading ? <SkeletonFace /> : null}
      {error || !(checked || loading) ? (
        <svg width={24} height={24} viewBox="0 0 24 24" className="absolute inset-0" aria-hidden="true" focusable="false">
          <rect x={1} y={1} width={22} height={22} rx={7} fill="none" stroke={error ? 'var(--status-bad)' : 'var(--fg-3)'} strokeWidth={2} />
        </svg>
      ) : null}
      {checked ? <Check size={16} strokeWidth={3} className={`relative ${loading ? 'text-[var(--fg-1)]' : 'text-[var(--bg)]'}`} /> : null}
    </span>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  error = false,
  disabled = false,
  loading = false,
  as = 'button',
}: Readonly<CheckboxProps>) {
  const box = <CheckboxBox checked={checked} error={error} loading={loading} />

  if (as === 'span') return box

  return (
    <Primitive.Root
      checked={checked}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onCheckedChange={(next) => onChange(next === true)}
      data-checked={checked ? '' : undefined}
      data-loading={loading ? '' : undefined}
      data-error={error ? '' : undefined}
      className={`orbit-press-content grid min-h-[var(--touch-min)] min-w-[var(--touch-min)] place-items-center border-0 bg-transparent p-0${loading ? '' : ' disabled:opacity-60'}`}
    >
      {box}
    </Primitive.Root>
  )
}
