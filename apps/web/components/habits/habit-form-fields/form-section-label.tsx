import type { ReactNode } from 'react'

export function FormSectionLabel({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="mb-2 text-sm font-medium text-[var(--fg-2)]">{children}</h2>
}
