import type { ReactNode } from 'react'

/** The page frame of the sign-in routes. It owns the main landmark for the current surface and for the guided one. */
export function AuthPageFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <main data-desktop-reload-safe="" data-auth-page-frame="" className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--bg)] text-[var(--fg-1)]"
    style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
    {children}
  </main>
}
