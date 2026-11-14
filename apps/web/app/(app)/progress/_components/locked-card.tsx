'use client'

import { Lock } from '@/components/ui/icons'
import { PillLink } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'

export function LockedCard({ title, body, action }: Readonly<{ title: string; body: string; action: string }>) {
  return (
    <div data-testid="progress-locked-card" className="flex flex-col items-start gap-3 rounded-[20px] bg-[var(--bg-card)] p-record-inset shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      <div className="flex items-center gap-3">
        <Lock size={20} strokeWidth={2} aria-hidden="true" className="text-[var(--fg-2)]" />
        <ProBadge alwaysVisible />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[16px] font-medium text-[var(--fg-1)]">{title}</p>
        <p className="text-[14px] text-[var(--fg-3)]">{body}</p>
      </div>
      <PillLink href="/upgrade" variant="ghost" size="sm">{action}</PillLink>
    </div>
  )
}
