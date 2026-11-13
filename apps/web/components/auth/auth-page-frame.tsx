import type { ReactNode } from 'react'

export function AuthPageFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <main data-desktop-reload-safe="" className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--bg)] text-[var(--fg-1)]"
    style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
    {children}
  </main>
}
