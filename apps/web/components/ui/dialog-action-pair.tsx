import type { ReactNode } from 'react'
import { MATCHED_PILL_MAX_WIDTH } from '@orbit/shared/theme'

/** Shared layout for the two matched PillButtons in a dialog. */
export function DialogActionPair({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto flex w-full flex-col" data-slot="dialog-action-pair" style={{ gap: 12, maxWidth: MATCHED_PILL_MAX_WIDTH }}>
      {children}
    </div>
  )
}
