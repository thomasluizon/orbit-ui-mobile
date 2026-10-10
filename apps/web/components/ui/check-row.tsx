'use client'

import { PersonalText } from '@/components/ui/personal-text'

import type { CheckRowProps } from '@orbit/shared/contracts/forms'
import { Checkbox } from './checkbox'

export function CheckRow({
  label,
  textMode,
  variant,
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
  if (textMode === 'personal' && onOpenLabel) return <PersonalCheckRow label={label} variant={variant} onOpenLabel={onOpenLabel} labelExpanded={labelExpanded} labelControls={labelControls} checked={checked} onChange={onChange} description={description} error={error} value={value} disabled={disabled} loading={loading} />

  return (
    <button
      data-slot="list-row-body"
      style={{ minHeight: error || description ? 68 : 52, paddingInline: 16, paddingBlock: 12, gap: 12 }}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      data-checked={checked ? '' : undefined}
      data-loading={loading ? '' : undefined}
      data-error={error ? '' : undefined}
      className="group/check-row orbit-hover-text flex w-full items-center rounded-[12px] border-0 bg-transparent text-left transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
    >
      <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span
          className={`text-base font-medium ${checked ? 'text-[var(--fg-3)] group-hover/check-row:text-[var(--fg-2)]' : 'text-[var(--fg-1)]'}`}
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

function PersonalCheckRow({ label, variant, onOpenLabel, labelExpanded, labelControls, checked, onChange, description, error, value, disabled, loading }: Readonly<CheckRowProps>) {
  const calendarDay = variant === 'calendar-day'
  return (
    <div data-slot="list-row-body" className="flex min-w-0 items-center" style={{ minHeight: calendarDay || error || description || value !== undefined ? 68 : 52, paddingInline: 16, paddingBlock: calendarDay ? 0 : 12, gap: 12 }}>
      <button type="button" data-variant={variant} onClick={onOpenLabel} aria-label={label} aria-expanded={labelExpanded} aria-controls={labelControls} style={{ gap: 4 }} className="orbit-check-row-label orbit-hover-text relative flex min-w-0 flex-1 flex-col justify-center rounded-[12px] border-0 bg-transparent text-start transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)]">
        <span aria-hidden="true" data-press-fill="" className="orbit-check-row-fill" /><PersonalText className={`text-base ${calendarDay ? 'font-normal' : 'font-medium'} text-[var(--fg-1)]`}>{label}</PersonalText>
        {error || description ? <span className={`text-sm ${error ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-2)]'}`}>{error ?? description}</span> : null}
        {value !== undefined ? <span className={`font-mono ${calendarDay ? 'text-xs' : 'text-sm'} tabular-nums text-[var(--fg-2)]`}>{value}</span> : null}
      </button>
      <button type="button" role="checkbox" aria-label={label} aria-checked={checked} disabled={disabled || loading} onClick={() => onChange(!checked)} data-loading={loading ? '' : undefined} className="orbit-check-row-control relative grid size-[24px] shrink-0 place-items-center rounded-[12px] border-0 bg-transparent transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] disabled:opacity-60">
        <span aria-hidden="true" data-press-fill="" className="orbit-check-row-fill grid place-items-center p-3">
          <Checkbox checked={checked} onChange={onChange} error={Boolean(error)} loading={loading} as="span" />
        </span>
      </button>
    </div>
  )
}
