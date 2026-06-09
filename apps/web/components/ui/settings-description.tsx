import type { ReactNode } from 'react'

interface SettingsDescriptionProps {
  children: ReactNode
}

export function SettingsDescription({ children }: Readonly<SettingsDescriptionProps>) {
  return (
    <p
      className="text-[13px] italic text-[var(--fg-3)] leading-relaxed"
      style={{
        fontFamily: 'var(--font-family-sans)',
        padding: '4px 20px 16px',
      }}
    >
      {children}
    </p>
  )
}
