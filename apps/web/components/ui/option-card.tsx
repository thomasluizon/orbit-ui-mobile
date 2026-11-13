'use client'

import type { OptionCardProps } from '@orbit/shared/contracts/flow'

const ARROW_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']

/** Arrow keys move focus between the options of one question. They never select: only Enter, Space or a press does. */
function moveFocusBetweenOptions(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (!ARROW_KEYS.includes(event.key)) return
  const group = event.currentTarget.closest('[data-option-group]')
  const options = [...(group?.querySelectorAll<HTMLButtonElement>('[data-option-card]:not(:disabled)') ?? [])]
  const current = options.indexOf(event.currentTarget)
  if (current < 0) return
  event.preventDefault()
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
  options[(current + step + options.length) % options.length]?.focus()
}

/** A quick option. A press answers. Selection takes the `--primary` ring and focus takes the `--fg-1` ring. */
export function OptionCard({ label, selected = false, disabled = false, disabledReason, onSelect, onHighlight }: Readonly<OptionCardProps>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        data-option-card=""
        data-selected={selected || undefined}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        onKeyDown={moveFocusBetweenOptions}
        onFocus={() => onHighlight?.(true)}
        onBlur={() => onHighlight?.(false)}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') onHighlight?.(true) }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') onHighlight?.(false) }}
        className="orbit-option-card"
      >
        {label}
      </button>
      {disabled && disabledReason ? <span className="text-center text-xs text-[var(--fg-3)]">{disabledReason}</span> : null}
    </div>
  )
}
