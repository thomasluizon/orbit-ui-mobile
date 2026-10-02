import type { ReactNode } from 'react'

export function FormSectionLabel({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="text-sm font-medium text-[var(--fg-2)]">{children}</h2>
}
