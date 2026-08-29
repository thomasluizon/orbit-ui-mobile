'use client'

import type { SwitchProps } from '@orbit/shared/contracts/forms'

export function Switch({ label, checked, onChange }: Readonly<SwitchProps>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      data-checked={checked ? '' : undefined}
      className="inline-flex min-h-11 shrink-0 items-center border-0 bg-transparent p-0"
    >
      <span
        className="inline-flex h-7 w-12 items-center rounded-[14px]"
        style={{
          background: checked
            ? 'var(--primary)'
            : 'color-mix(in srgb, var(--fg-1) 16%, transparent)',
        }}
      >
        <span
          className="size-[22px] rounded-[11px] bg-[var(--fg-on-primary)] transition-transform duration-[var(--dur-1)] ease-[var(--ease-standard)]"
          style={{ transform: checked ? 'translateX(23px)' : 'translateX(3px)' }}
        />
      </span>
    </button>
  )
}
