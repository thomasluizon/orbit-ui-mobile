'use client'

import type { PageHeaderProps } from '@orbit/shared/contracts/navigation'
import { ArrowLeft } from '@/components/ui/icons'
import { useShellHeaderSlot } from '@/components/shell/destination-shell'
import { useIsClient } from '@/hooks/use-is-client'

function PageHeaderContent({ title, titleTranslate, backLabel, onBack, action, footer }: Readonly<PageHeaderProps>) {
  return <header className="shadow-[inset_0_-1px_0_var(--hairline)]">
    <div className="flex min-h-[60px] items-center gap-[8px] py-[8px] ps-[8px] pe-[16px]">
      <button type="button" aria-label={backLabel} onClick={onBack}
        className="grid min-h-[48px] w-[48px] shrink-0 place-items-center rounded-full text-[var(--fg-1)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2">
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <h1 tabIndex={-1} translate={titleTranslate} className="min-w-0 flex-1 truncate text-start text-[length:var(--fs-lg)] font-medium text-[var(--fg-1)]">{title}</h1>
      {action}
    </div>
    {footer}
  </header>
}

export function PageHeader(props: Readonly<PageHeaderProps>) {
  const client = useIsClient()
  const hosted = useShellHeaderSlot(() => <PageHeaderContent {...props} />, props.refreshKey ?? props.title)
  return hosted && client ? null : <PageHeaderContent {...props} />
}
