'use client'

import type { StepUpProps } from '@orbit/shared/contracts/overlay'
import { Shield } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'

/** A neutral handoff to the real sign-in surface. It never collects credentials. */
export function StepUp({ message, actionLabel, onAction, busy = false }: Readonly<StepUpProps>) {
  return (
    <section className="orbit-step-up" aria-busy={busy || undefined}>
      <Shield size={20} strokeWidth={1.5} aria-hidden="true" />
      <p>{message}</p>
      <Button variant="primary" size="sm" loading={busy} onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  )
}
