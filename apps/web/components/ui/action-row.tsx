'use client'

import { createContext, type ReactNode } from 'react'

export const ActionRowContext = createContext(false)

export function ActionRow({ children, align = 'end', layout = 'wrap' }: Readonly<{ children: ReactNode; align?: 'end' | 'center'; layout?: 'wrap' | 'scroll' }>) {
  return <ActionRowContext value>
    <div data-slot="action-row" style={{ display: 'flex', flexDirection: 'row', flexWrap: layout === 'scroll' ? 'nowrap' : 'wrap', justifyContent: layout === 'scroll' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end', alignItems: 'center', gap: layout === 'scroll' ? 8 : 12, minWidth: 0, maxWidth: '100%', width: '100%' }}>{children}</div>
  </ActionRowContext>
}
