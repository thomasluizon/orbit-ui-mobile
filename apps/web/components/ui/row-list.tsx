'use client'

import { Children, isValidElement, type CSSProperties } from 'react'
import type { RowListProps } from '@orbit/shared/contracts/lists'

/** One shared settings panel. Habit rows deliberately do not use this container. */
export function RowList({ children, style }: Readonly<RowListProps>) {
  const rows = Children.toArray(children).filter(isValidElement)

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 20,
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        overflow: 'hidden',
        ...(style as CSSProperties | undefined),
      }}
    >
      {rows.map((row, index) => (
        <div
          key={row.key ?? index}
          style={index === 0 ? undefined : { borderTop: '1px solid var(--hairline)' }}
        >
          {row}
        </div>
      ))}
    </div>
  )
}
