import type { ReactNode } from 'react'

interface SettingsDescriptionProps {
  children: ReactNode
}

/** Helper text under a settings row: Rubik 14 fg-3, row-aligned 20px horizontal padding. */
export function SettingsDescription({ children }: Readonly<SettingsDescriptionProps>) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.5,
        color: 'var(--fg-3)',
        padding: '4px 20px 16px',
      }}
    >
      {children}
    </p>
  )
}
