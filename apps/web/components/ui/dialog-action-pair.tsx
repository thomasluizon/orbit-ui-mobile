import type { ReactNode } from 'react'

/** Intrinsic-width dialog actions aligned to the trailing edge. */
export function DialogActionPair({ children }: Readonly<{ children: ReactNode; inline?: boolean }>) {
  return (
    <div data-slot="dialog-action-pair" style={{ display: 'flex', gap: 12, maxWidth: '100%', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
      {children}
    </div>
  )
}
