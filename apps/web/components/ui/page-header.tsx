'use client'

import type { PageHeaderProps } from '@orbit/shared/contracts/navigation'
import { ArrowLeft } from '@/components/ui/icons'
import { useShellHeaderSlot } from '@/components/shell/destination-shell'

function PageHeaderContent({ title, backLabel, onBack, action, footer }: Readonly<PageHeaderProps>) {
  return <header className="shadow-[inset_0_-1px_0_var(--hairline)]">
    <div className="flex min-h-[60px] items-center gap-2 py-2 ps-2 pe-4">
      <button type="button" aria-label={backLabel} onClick={onBack}
        className="grid size-11 shrink-0 place-items-center rounded-[8px] text-[var(--fg-1)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2">
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <h1 tabIndex={-1} className="min-w-0 flex-1 truncate text-start text-[length:var(--fs-lg)] font-medium text-[var(--fg-1)]">{title}</h1>
      {action}
    </div>
    {footer}
  </header>
}

export function PageHeader(props: Readonly<PageHeaderProps>) {
  const hosted = useShellHeaderSlot(() => <PageHeaderContent {...props} />, props.refreshKey ?? props.title)
  return hosted ? null : <PageHeaderContent {...props} />
}
