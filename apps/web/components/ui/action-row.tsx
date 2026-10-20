'use client'

import { createContext, type ReactNode } from 'react'

export const ActionRowContext = createContext(false)

export function ActionRow({ children, align = 'end' }: Readonly<{ children: ReactNode; align?: 'end' | 'center' }>) {
  return <ActionRowContext value>
    <div data-slot="action-row" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-end', alignItems: 'center', gap: 12, minWidth: 0, maxWidth: '100%', width: '100%' }}>{children}</div>
  </ActionRowContext>
}
