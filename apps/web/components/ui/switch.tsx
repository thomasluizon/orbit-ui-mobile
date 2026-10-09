'use client'

import type { SwitchProps } from '@orbit/shared/contracts/forms'
import { ListRow } from './list-row'

export function Switch({ label, checked, disabled = false, onChange }: Readonly<SwitchProps>) {
  return <ListRow title={label} disabled={disabled} toggle={{ checked, onChange }} />
}

export function SwitchTrack({ checked, pending }: Readonly<{ checked: boolean; pending?: boolean }>) {
  return <span aria-hidden="true" data-slot="switch-track" data-checked={checked ? '' : undefined} data-pending={pending ? '' : undefined} className="inline-flex h-7 w-12 shrink-0 items-center rounded-[14px]" style={{ background: checked ? 'var(--primary)' : 'var(--track-empty)' }}>
    <span className="size-[22px] rounded-[11px] bg-[var(--fg-on-primary)] transition-transform duration-[var(--dur-1)] ease-[var(--ease-standard)]" style={{ transform: checked ? 'translateX(23px)' : 'translateX(3px)' }} />
  </span>
}
