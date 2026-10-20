'use client'

import React, { type ReactNode } from 'react'

interface SettingsGroupProps {
  children: ReactNode
}

/**
 * Grouped settings list: rows sit flat on the canvas (no card surface),
 * separated by full-width hairline dividers drawn by the group.
 */
export function SettingsGroup({ children }: Readonly<SettingsGroupProps>) {
  const items = React.Children.toArray(children).filter(React.isValidElement)
  return (
    <div>
      {items.map((child, index) => (
        <div key={child.key}>
          {index > 0 ? (
            <div
              aria-hidden="true"
              style={{
                height: 1,
                background: 'var(--hairline)',
              }}
            />
          ) : null}
          {child}
        </div>
      ))}
    </div>
  )
}
