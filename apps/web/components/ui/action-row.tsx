'use client'

import { createContext, useContext, type ReactNode } from 'react'

export const ActionRowContext = createContext(false)

export function ActionRow({ children }: Readonly<{ children: ReactNode }>) {
  const withinRow = useContext(ActionRowContext)
  if (withinRow) return children
  return <ActionRowContext value>
    <div data-slot="action-row" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 12, minWidth: 0, maxWidth: '100%', width: '100%' }}>{children}</div>
  </ActionRowContext>
}
