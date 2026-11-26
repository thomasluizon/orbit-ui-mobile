'use client'

import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react'
import type { OptionCardProps } from '@orbit/shared/contracts/flow'
import { SkeletonFace } from '@/components/ui/skeleton'

const ARROW_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']

const OptionReasonContext = createContext<((id: string, reason: string | null) => void) | null>(null)

function useReportedReason(reason: string | null) {
  const report = useContext(OptionReasonContext)
  const id = useId()
  useEffect(() => {
    report?.(id, reason)
    return () => report?.(id, null)
  }, [report, id, reason])
  return report !== null
}

/** The grid of the quick options of one question. A disabled option reports its reason here, and the group shows each different reason once, centred, 8 under the grid. */
export function OptionGroup({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  const [reasons, setReasons] = useState<ReadonlyMap<string, string>>(new Map())
  const report = useCallback((id: string, reason: string | null) => {
    setReasons((current) => {
      if ((current.get(id) ?? null) === reason) return current
      const next = new Map(current)
      if (reason === null) next.delete(id)
      else next.set(id, reason)
      return next
    })
  }, [])
  const shown = [...new Set(reasons.values())]
  return (
    <div data-option-block="" className="flex w-full flex-col gap-2">
      <OptionReasonContext value={report}>
        <div role="group" aria-label={label} data-option-group="" className="grid w-full grid-cols-2 gap-3">{children}</div>
      </OptionReasonContext>
      {shown.map((reason) => <p key={reason} data-option-reason="" className="text-center text-xs text-[var(--fg-3)]">{reason}</p>)}
    </div>
  )
}

/** Arrow keys move focus between the options of one question. They never select: only Enter, Space or a press does. */
export function moveFocusBetweenOptions(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (!ARROW_KEYS.includes(event.key)) return
  const group = event.currentTarget.closest('[data-option-group]')
  const options = [...(group?.querySelectorAll<HTMLButtonElement>('[data-option-card]:not(:disabled)') ?? [])]
  const current = options.indexOf(event.currentTarget)
  if (current < 0) return
  event.preventDefault()
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
  options[(current + step + options.length) % options.length]?.focus()
}

/** A quick option. A press answers. Selection takes the `--primary` ring and focus takes the `--fg-1` ring. A wide option holds one line and ends a long label with an ellipsis; its accessible name keeps the full label. An option that waits for its own request keeps its label over the skeleton face. */
export function OptionCard({ label, selected = false, disabled = false, disabledReason, loading = false, wide = false, onSelect, onHighlight }: Readonly<OptionCardProps>) {
  const reason = disabled && disabledReason ? disabledReason : null
  const inGroup = useReportedReason(reason)
  return (
    <div data-option-wide={wide || undefined} className={`flex min-w-0 flex-col gap-1${wide ? ' col-span-full' : ''}`}>
      <button
        type="button"
        data-option-card=""
        data-selected={selected || undefined}
        aria-pressed={selected}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        onClick={onSelect}
        onKeyDown={moveFocusBetweenOptions}
        onFocus={() => onHighlight?.(true)}
        onBlur={() => onHighlight?.(false)}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') onHighlight?.(true) }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') onHighlight?.(false) }}
        className="orbit-option-card press-hit-layer isolate"
      >
        {loading ? <SkeletonFace /> : null}
        {wide ? <span className="min-w-0 truncate">{label}</span> : label}
      </button>
      {reason && !inGroup ? <span className="text-center text-xs text-[var(--fg-3)]">{reason}</span> : null}
    </div>
  )
}
