'use client'

import type { CheckRowProps } from '@orbit/shared/contracts/forms'
import { Checkbox } from './checkbox'

export function CheckRow({
  label,
  textMode,
  onOpenLabel,
  labelExpanded,
  labelControls,
  checked,
  onChange,
  description,
  error,
  value,
  disabled = false,
  loading = false,
}: Readonly<CheckRowProps>) {
  if (textMode === 'personal' && onOpenLabel) return <PersonalCheckRow label={label} onOpenLabel={onOpenLabel} labelExpanded={labelExpanded} labelControls={labelControls} checked={checked} onChange={onChange} description={description} error={error} value={value} disabled={disabled} loading={loading} />

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
      className="orbit-hover-text flex min-h-14 w-full items-center gap-3 rounded-[12px] border-0 bg-transparent px-4 py-2 text-left transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
    >
      <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={`text-base font-medium ${checked ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}
        >
          {label}
        </span>
        {error || description ? (
          <span className={`text-sm ${error ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-2)]'}`}>
            {error ?? description}
          </span>
        ) : null}
      </span>
      {value !== undefined ? (
        <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--fg-2)]">{value}</span>
      ) : null}
    </button>
  )
}

function PersonalCheckRow({ label, onOpenLabel, labelExpanded, labelControls, checked, onChange, description, error, value, disabled, loading }: Readonly<CheckRowProps>) {
  return (
    <div className="flex min-h-[68px] min-w-0 items-start gap-2 px-2 py-2">
      <button type="button" onClick={onOpenLabel} aria-label={label} aria-expanded={labelExpanded} aria-controls={labelControls} className="orbit-hover-text flex min-h-12 min-w-0 flex-1 flex-col justify-center gap-1 px-2 py-1 overflow-hidden rounded-[12px] border-0 bg-transparent text-start transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="line-clamp-2 text-base font-medium [overflow-wrap:anywhere] text-[var(--fg-1)]">{label}</span>
        {error || description ? <span className={`text-sm ${error ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-2)]'}`}>{error ?? description}</span> : null}
        {value !== undefined ? <span className="font-mono text-sm tabular-nums text-[var(--fg-2)]">{value}</span> : null}
      </button>
      <button type="button" role="checkbox" aria-label={label} aria-checked={checked} disabled={disabled || loading} onClick={() => onChange(!checked)} data-loading={loading ? '' : undefined} className="grid min-h-12 min-w-12 place-items-center overflow-hidden rounded-[12px] border-0 bg-transparent transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      </button>
    </div>
  )
}
