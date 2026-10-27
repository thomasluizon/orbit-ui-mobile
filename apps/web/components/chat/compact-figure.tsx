import type { ReactNode } from 'react'

export function CompactFigure({ value, unit }: Readonly<{ value: string | number; unit: string }>) {
  return <span data-compact-figure="" className="flex min-w-0 flex-wrap items-baseline gap-2 text-[var(--fg-1)]"><span className="text-[22px] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{value}</span><span className="text-sm text-[var(--fg-2)]">{unit}</span></span>
}

export function FigureList({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex min-w-0 flex-col gap-2">{children}</div>
}
