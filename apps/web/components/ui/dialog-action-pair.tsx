import type { ReactNode } from 'react'
import { MATCHED_PILL_MAX_WIDTH } from '@orbit/shared/theme'

/** Shared layout for a dialog's stacked actions: full width, capped at the matched pill width, centred. */
export function DialogActionPair({ children, inline = false }: Readonly<{ children: ReactNode; inline?: boolean }>) {
  return (
    <div className={`mx-auto flex w-full ${inline ? 'flex-row justify-end' : 'flex-col'}`} data-slot="dialog-action-pair" style={{ gap: 12, maxWidth: MATCHED_PILL_MAX_WIDTH }}>
      {children}
    </div>
  )
}
