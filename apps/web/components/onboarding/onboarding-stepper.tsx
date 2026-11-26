'use client'

import { Minus, Plus } from '@/components/ui/icons'

interface StepperProps {
  value: number
  minimum: number
  maximum?: number
  lessLabel: string
  moreLabel: string
  description: string
  onChange: (value: number) => void
}

/** A count control: minus, the value and plus, with what the count means beside it. */
export function Stepper({ value, minimum, maximum, lessLabel, moreLabel, description, onChange }: Readonly<StepperProps>) {
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" aria-label={lessLabel} disabled={value <= minimum} className="habit-control-motion press-hit-layer grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--fg-1)] enabled:active:bg-[var(--bg-hover)] motion-safe:active:scale-[0.96] disabled:opacity-40" onClick={() => onChange(Math.max(minimum, value - 1))}><Minus size={20} strokeWidth={2} aria-hidden="true" /></button>
    <span className="min-w-7 text-center font-mono text-xl tabular-nums">{value}</span>
    <button type="button" aria-label={moreLabel} disabled={maximum !== undefined && value >= maximum} className="habit-control-motion press-hit-layer grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--fg-1)] enabled:active:bg-[var(--bg-hover)] motion-safe:active:scale-[0.96] disabled:opacity-40" onClick={() => onChange(maximum === undefined ? value + 1 : Math.min(maximum, value + 1))}><Plus size={20} strokeWidth={2} aria-hidden="true" /></button>
    <span className="text-sm text-[var(--fg-3)]">{description}</span>
  </div>
}
