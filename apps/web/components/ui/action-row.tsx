'use client'

import { createContext, type ReactNode } from 'react'

export const ActionRowContext = createContext(false)

export function ActionRow({ children }: Readonly<{ children: ReactNode }>) {
  return <ActionRowContext value>
    <div data-slot="action-row" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 12, minWidth: 0, width: '100%' }}>{children}</div>
  </ActionRowContext>
}
