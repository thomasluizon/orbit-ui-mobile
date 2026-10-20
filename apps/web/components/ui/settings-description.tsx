import type { ReactNode } from 'react'

interface SettingsDescriptionProps {
  children: ReactNode
  inset?: boolean
}

/** Helper text under a settings row: Geist Sans 14 fg-3, row-aligned 16px horizontal padding. */
export function SettingsDescription({ children, inset = true }: Readonly<SettingsDescriptionProps>) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.5,
        color: 'var(--fg-3)',
        padding: inset ? "var(--orbit-space-4) var(--orbit-space-16) var(--orbit-space-16)" : "var(--orbit-space-4) var(--orbit-space-0) var(--orbit-space-16)",
      }}
    >
      {children}
    </p>
  )
}
