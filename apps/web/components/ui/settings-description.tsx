import type { ReactNode } from 'react'

interface SettingsDescriptionProps {
  children: ReactNode
}

/** Helper text under a settings row: Geist Sans 14 fg-3, row-aligned 16px horizontal padding. */
export function SettingsDescription({ children }: Readonly<SettingsDescriptionProps>) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.5,
        color: 'var(--fg-3)',
        padding: '4px 16px 16px',
      }}
    >
      {children}
    </p>
  )
}
