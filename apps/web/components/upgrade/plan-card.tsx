import type { PlanCardProps } from '@orbit/shared/contracts/display'

/** Upgrade chooser card: muted Free, violet-lit yearly hero, or outline monthly anchor, each carrying its own CTA. */
export function PlanCard({
  name,
  price,
  badge,
  selected = false,
  disabled = false,
  loading = false,
  onClick,
}: Readonly<PlanCardProps>) {
  const unavailable = disabled || loading

  return (
    <button
      type="button"
      onClick={unavailable ? undefined : onClick}
      disabled={unavailable}
      aria-busy={loading || undefined}
      aria-pressed={selected}
      data-selected={selected || undefined}
      className="flex w-full items-center justify-between rounded-[20px] border-0 p-6 text-left disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: selected ? 'rgba(var(--primary-rgb), 0.10)' : 'var(--bg-card)',
        boxShadow: selected ? 'inset 0 0 0 1.5px var(--primary)' : 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-base font-medium text-[var(--fg-1)]">{name}</span>
        {badge}
      </span>
      <span className="font-display text-[22px] font-semibold tabular-nums text-[var(--fg-1)]">{price}</span>
    </button>
  )
}
