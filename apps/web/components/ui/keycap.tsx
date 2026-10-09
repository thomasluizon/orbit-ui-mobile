import type { ReactNode } from 'react'

export function Keycap({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <kbd
      data-keycap=""
      className="t-meta flex h-[20px] min-w-[20px] shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] px-1 py-0"
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      {children}
    </kbd>
  )
}
