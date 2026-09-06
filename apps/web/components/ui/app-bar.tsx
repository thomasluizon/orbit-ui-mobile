'use client'

import type { NavHeaderProps } from '@orbit/shared/contracts/navigation'
import { ChevronLeft } from '@/components/ui/icons'

export function AppBar({ title, onBack, backLabel, action }: Readonly<NavHeaderProps>) {
  return (
    <header data-back={onBack ? true : undefined} className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 px-4">
      <div className="flex min-w-11 justify-start">
        {onBack && (
          <button type="button" aria-label={backLabel} onClick={onBack} className="flex size-11 items-center justify-center rounded-full text-[var(--fg-1)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2">
            <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <h1 className="min-w-0 text-center font-mono text-[13px] font-medium uppercase tracking-[0.09em] text-[var(--fg-1)]">{title}</h1>
      <div className="flex min-w-11 items-center justify-end gap-3">{action}</div>
    </header>
  )
}
